#!/usr/bin/env python3
"""
Load the Kaggle Global Air Pollution Dataset (2025-2026) into BigQuery.

Source  : Kaggle "Global Air Pollution Data 2025-2026"
          (8 global cities, hourly readings Nov 2025 – Feb 2026)
Columns : Date, City (as "City, Country"), Latitude, Longitude, PM2.5, PM10,
          NO2, SO2, CO, Ozone, Aerosol_Optical_Depth, AQI_Class
Target  : {BQ_PROJECT}.{BQ_DATASET}.global_aqi_reference
Strategy: WRITE_TRUNCATE — always replaces the table (idempotent)

The table is used by the app API as supplementary time-series data alongside
the OpenAQ aqi_measurements table. Jakarta, Indonesia is the only SEA city
in this dataset.

Usage:
  BQ_PROJECT=aircare-sea python scripts/load_kaggle_aqi.py
  BQ_PROJECT=aircare-sea KAGGLE_CSV=gs://my-bucket/path/file.csv python scripts/load_kaggle_aqi.py
  BQ_PROJECT=aircare-sea KAGGLE_CSV=/local/path/file.csv python scripts/load_kaggle_aqi.py

Env vars:
  KAGGLE_CSV    - GCS path (gs://...) or local path to the CSV file
                  (default: gs://aircare-sea-data/raw/csv/kaggle-gp-dataset.csv)
  BQ_PROJECT    - GCP project ID      (default: aircare-sea)
  BQ_DATASET    - BigQuery dataset    (default: aircare_sea)
  BQ_TABLE      - BigQuery table name (default: global_aqi_reference)
"""

import io
import os
import sys
from pathlib import Path

import pandas as pd
from google.cloud import bigquery, storage
from google.cloud.bigquery import SchemaField, LoadJobConfig, WriteDisposition

DEFAULT_CSV = "gs://aircare-sea-data/raw/csv/kaggle-gp-dataset.csv"

KAGGLE_CSV = os.environ.get("KAGGLE_CSV", DEFAULT_CSV)
PROJECT = os.environ.get("BQ_PROJECT", "aircare-sea")
DATASET = os.environ.get("BQ_DATASET", "aircare_sea")
TABLE   = os.environ.get("BQ_TABLE",   "global_aqi_reference")

SCHEMA = [
    SchemaField("timestamp",              "TIMESTAMP", mode="NULLABLE"),
    SchemaField("city",                   "STRING",    mode="NULLABLE"),
    SchemaField("country",                "STRING",    mode="NULLABLE"),
    SchemaField("latitude",               "FLOAT",     mode="NULLABLE"),
    SchemaField("longitude",              "FLOAT",     mode="NULLABLE"),
    SchemaField("pm25",                   "FLOAT",     mode="NULLABLE"),
    SchemaField("pm10",                   "FLOAT",     mode="NULLABLE"),
    SchemaField("no2",                    "FLOAT",     mode="NULLABLE"),
    SchemaField("so2",                    "FLOAT",     mode="NULLABLE"),
    SchemaField("co",                     "FLOAT",     mode="NULLABLE"),
    SchemaField("ozone",                  "FLOAT",     mode="NULLABLE"),
    SchemaField("aerosol_optical_depth",  "FLOAT",     mode="NULLABLE"),
    SchemaField("aqi_class",              "STRING",    mode="NULLABLE"),
]

# CSV column → BigQuery column
COLUMN_MAP = {
    "Date":                   "timestamp",
    "City":                   "city_raw",      # temporary; split into city + country below
    "Latitude":               "latitude",
    "Longitude":              "longitude",
    "PM2.5":                  "pm25",
    "PM10":                   "pm10",
    "NO2":                    "no2",
    "SO2":                    "so2",
    "CO":                     "co",
    "Ozone":                  "ozone",
    "Aerosol_Optical_Depth":  "aerosol_optical_depth",
    "AQI_Class":              "aqi_class",
}


def _read_bytes(path: str) -> io.BytesIO:
    """Download from GCS (gs://...) or read from local disk."""
    if path.startswith("gs://"):
        # Parse bucket and blob from gs://bucket/path/to/file
        without_scheme = path[len("gs://"):]
        bucket_name, _, blob_name = without_scheme.partition("/")
        print(f"Downloading from GCS: gs://{bucket_name}/{blob_name}")
        gcs = storage.Client(project=PROJECT)
        bucket = gcs.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        data = blob.download_as_bytes()
        return io.BytesIO(data)
    else:
        local = Path(path)
        if not local.exists():
            print(f"CSV not found: {local}")
            print("Set KAGGLE_CSV env var to the correct path.")
            sys.exit(1)
        return io.BytesIO(local.read_bytes())


def load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(_read_bytes(path), encoding="utf-8-sig")
    df.rename(columns=COLUMN_MAP, inplace=True)

    # Split "City, Country" → separate city and country columns
    split = df["city_raw"].str.rsplit(",", n=1, expand=True)
    df["city"]    = split[0].str.strip()
    df["country"] = split[1].str.strip() if split.shape[1] > 1 else ""
    df.drop(columns=["city_raw"], inplace=True)

    # Parse timestamp with UTC timezone
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")

    # Numeric columns
    float_cols = ["latitude", "longitude", "pm25", "pm10", "no2",
                  "so2", "co", "ozone", "aerosol_optical_depth"]
    for col in float_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Reorder to match SCHEMA
    return df[["timestamp", "city", "country", "latitude", "longitude",
               "pm25", "pm10", "no2", "so2", "co", "ozone",
               "aerosol_optical_depth", "aqi_class"]]


def main() -> None:
    print(f"Source  : {KAGGLE_CSV}")
    print(f"Target  : {PROJECT}.{DATASET}.{TABLE}")
    print(f"Strategy: WRITE_TRUNCATE (replaces table on each run)")
    print()

    print("Reading CSV...")
    df = load_csv(KAGGLE_CSV)
    print(f"Loaded {len(df):,} rows, {len(df.columns)} columns")
    print(f"Date range: {df['timestamp'].min()} → {df['timestamp'].max()}")
    print(f"Cities ({df['city'].nunique()}): {', '.join(sorted(df['city'].unique()))}")

    sea_countries = {
        "Indonesia", "Thailand", "Philippines", "Vietnam", "Malaysia",
        "Singapore", "Myanmar", "Cambodia", "Laos", "Brunei",
    }
    sea_count = df["country"].isin(sea_countries).sum()
    print(f"SEA rows : {sea_count:,} ({sea_count / len(df) * 100:.1f}% of total)")
    print()

    client = bigquery.Client(project=PROJECT)
    table_ref = f"{PROJECT}.{DATASET}.{TABLE}"

    job_config = LoadJobConfig(
        schema=SCHEMA,
        write_disposition=WriteDisposition.WRITE_TRUNCATE,
    )

    print(f"Loading into BigQuery {table_ref} ...")
    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()

    table = client.get_table(table_ref)
    print(f"\nDone. {table.num_rows:,} rows in {table_ref}")
    print()
    print("Example queries:")
    print(f"  -- Latest reading per city")
    print(f"  SELECT city, country, pm25, aqi_class, timestamp")
    print(f"  FROM `{table_ref}`")
    print(f"  WHERE timestamp = (SELECT MAX(timestamp) FROM `{table_ref}`)")
    print(f"  ORDER BY pm25 DESC;")
    print()
    print(f"  -- Jakarta hourly PM2.5")
    print(f"  SELECT timestamp, pm25, aqi_class")
    print(f"  FROM `{table_ref}`")
    print(f"  WHERE LOWER(city) = 'jakarta'")
    print(f"  ORDER BY timestamp DESC LIMIT 24;")


if __name__ == "__main__":
    main()
