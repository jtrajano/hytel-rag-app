#!/usr/bin/env python3
"""
Load the Kaggle Global Air Pollution Dataset into BigQuery as a reference table.

Source  : Kaggle "Global Air Pollution Dataset" (23 463 cities, one row per city)
Target  : {BQ_PROJECT}.{BQ_DATASET}.global_aqi_reference
Strategy: WRITE_TRUNCATE — always replaces the table (idempotent, static data)

The table is used by the app API as a fallback when a city is not in the
OpenAQ time-series data (aqi_measurements), giving PM2.5 + multi-pollutant
AQI context for 1 219 Southeast Asian cities and 23 000+ globally.

Usage:
  BQ_PROJECT=aircare-sea python scripts/load_kaggle_aqi.py
  BQ_PROJECT=aircare-sea KAGGLE_CSV=path/to/file.csv python scripts/load_kaggle_aqi.py

Env vars:
  KAGGLE_CSV    - Path to the Kaggle CSV file
                  (default: C:/Users/Jeff/Downloads/kaggle-gp-dataset/global air pollution dataset.csv)
  BQ_PROJECT    - GCP project ID      (default: aircare-sea)
  BQ_DATASET    - BigQuery dataset    (default: aircare_sea)
  BQ_TABLE      - BigQuery table name (default: global_aqi_reference)
"""

import os
import sys
from pathlib import Path

import pandas as pd
from google.cloud import bigquery
from google.cloud.bigquery import SchemaField, LoadJobConfig, WriteDisposition

DEFAULT_CSV = (
    r"C:/Users/Jeff/Downloads/kaggle-gp-dataset/global air pollution dataset.csv"
)

KAGGLE_CSV = os.environ.get("KAGGLE_CSV", DEFAULT_CSV)
PROJECT = os.environ.get("BQ_PROJECT", "aircare-sea")
DATASET = os.environ.get("BQ_DATASET", "aircare_sea")
TABLE = os.environ.get("BQ_TABLE", "global_aqi_reference")

SCHEMA = [
    SchemaField("country",         "STRING",  mode="NULLABLE"),
    SchemaField("city",            "STRING",  mode="NULLABLE"),
    SchemaField("aqi_value",       "INTEGER", mode="NULLABLE"),
    SchemaField("aqi_category",    "STRING",  mode="NULLABLE"),
    SchemaField("co_aqi_value",    "INTEGER", mode="NULLABLE"),
    SchemaField("co_aqi_category", "STRING",  mode="NULLABLE"),
    SchemaField("ozone_aqi_value", "INTEGER", mode="NULLABLE"),
    SchemaField("ozone_aqi_category", "STRING", mode="NULLABLE"),
    SchemaField("no2_aqi_value",   "INTEGER", mode="NULLABLE"),
    SchemaField("no2_aqi_category","STRING",  mode="NULLABLE"),
    SchemaField("pm25_aqi_value",  "INTEGER", mode="NULLABLE"),
    SchemaField("pm25_aqi_category","STRING", mode="NULLABLE"),
]

# Kaggle column name → BigQuery column name
COLUMN_MAP = {
    "Country":           "country",
    "City":              "city",
    "AQI Value":         "aqi_value",
    "AQI Category":      "aqi_category",
    "CO AQI Value":      "co_aqi_value",
    "CO AQI Category":   "co_aqi_category",
    "Ozone AQI Value":   "ozone_aqi_value",
    "Ozone AQI Category":"ozone_aqi_category",
    "NO2 AQI Value":     "no2_aqi_value",
    "NO2 AQI Category":  "no2_aqi_category",
    "PM2.5 AQI Value":   "pm25_aqi_value",
    "PM2.5 AQI Category":"pm25_aqi_category",
}


def load_csv(path: str) -> pd.DataFrame:
    csv_path = Path(path)
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        print("Set KAGGLE_CSV env var to the correct path.")
        sys.exit(1)

    df = pd.read_csv(csv_path, encoding="utf-8-sig")
    df.rename(columns=COLUMN_MAP, inplace=True)

    # Integer columns — coerce bad values to NaN then Int64 (nullable int)
    int_cols = ["aqi_value", "co_aqi_value", "ozone_aqi_value",
                "no2_aqi_value", "pm25_aqi_value"]
    for col in int_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")

    return df


def main() -> None:
    print(f"Source  : {KAGGLE_CSV}")
    print(f"Target  : {PROJECT}.{DATASET}.{TABLE}")
    print(f"Strategy: WRITE_TRUNCATE (replaces table on each run)")
    print()

    print("Reading CSV...")
    df = load_csv(KAGGLE_CSV)
    print(f"Loaded {len(df):,} rows, {len(df.columns)} columns")

    # Quick SEA preview
    sea_countries = {
        "Thailand", "Philippines", "Indonesia", "Vietnam", "Viet Nam",
        "Malaysia", "Singapore", "Myanmar", "Cambodia", "Laos",
    }
    sea_count = df["country"].isin(sea_countries).sum()
    print(f"SEA rows: {sea_count:,} ({sea_count / len(df) * 100:.1f}% of total)")
    print()

    client = bigquery.Client(project=PROJECT)
    table_ref = f"{PROJECT}.{DATASET}.{TABLE}"

    job_config = LoadJobConfig(
        schema=SCHEMA,
        write_disposition=WriteDisposition.WRITE_TRUNCATE,
    )

    print(f"Loading into BigQuery {table_ref} ...")
    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()  # wait for completion

    table = client.get_table(table_ref)
    print(f"\nDone. {table.num_rows:,} rows in {table_ref}")
    print()
    print("Example queries:")
    print(f"  -- All SEA cities")
    print(f"  SELECT country, city, aqi_value, aqi_category, pm25_aqi_value")
    print(f"  FROM `{table_ref}`")
    print(f"  WHERE country IN ('Thailand','Philippines','Indonesia','Vietnam','Malaysia','Singapore')")
    print(f"  ORDER BY pm25_aqi_value DESC")
    print(f"  LIMIT 20;")
    print()
    print(f"  -- Fallback lookup for a city not in aqi_measurements")
    print(f"  SELECT * FROM `{table_ref}` WHERE LOWER(city) = 'bangkok' LIMIT 1;")


if __name__ == "__main__":
    main()
