#!/usr/bin/env python3
"""
Prepare Vertex AI AutoML Forecasting training data from BigQuery.

Reads from aircare_sea.aqi_measurements, aggregates to hourly averages
per city, and outputs a long-format CSV to GCS:

  timestamp, city, pm25, pm10, no2

This format satisfies Vertex AI AutoML Forecasting requirements:
  time_column                   = timestamp
  time_series_identifier_column = city
  target_column                 = pm25

Usage:
  BQ_PROJECT=aircare-sea python scripts/prepare_training_data.py

Env vars:
  BQ_PROJECT     - GCP project ID       (default: aircare-sea)
  BQ_DATASET     - BigQuery dataset     (default: aircare_sea)
  GCS_BUCKET     - Output GCS bucket    (default: aircare-sea-data)
  LOOKBACK_DAYS  - Days of history      (default: 90)

Requirements:
  pip install google-cloud-bigquery[pandas]
"""

import os
import sys
import platform
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

# On Windows, gsutil is a .cmd batch file and requires shell=True to be found
_SHELL = platform.system() == "Windows"

PROJECT = os.environ.get("BQ_PROJECT", "aircare-sea")
DATASET = os.environ.get("BQ_DATASET", "aircare_sea")
BUCKET = os.environ.get("GCS_BUCKET", "aircare-sea-data")
GCS_OUTPUT_PREFIX = "processed/training"

try:
    from google.cloud import bigquery
    import pandas as pd
except ImportError:
    print("Missing dependencies. Run: pip install google-cloud-bigquery[pandas]")
    sys.exit(1)


def build_query() -> str:
    # Use all available data — more history = better AutoML forecast model.
    # Filter with HAVING so hourly groups missing pm25 entirely are excluded,
    # while groups with partial pm25 readings still contribute their average.
    return f"""
    SELECT * FROM (
      SELECT
        city,
        TIMESTAMP_TRUNC(timestamp, HOUR) AS timestamp,
        AVG(pm25) AS pm25,
        AVG(pm10) AS pm10,
        AVG(no2)  AS no2
      FROM `{PROJECT}.{DATASET}.aqi_measurements`
      WHERE timestamp IS NOT NULL
      GROUP BY city, TIMESTAMP_TRUNC(timestamp, HOUR)
    )
    WHERE pm25 IS NOT NULL
    ORDER BY city, timestamp
    """


def upload_to_gcs(local_path: str, gcs_uri: str) -> None:
    result = subprocess.run(
        ["gsutil", "cp", local_path, gcs_uri],
        capture_output=True,
        text=True,
        shell=_SHELL,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gsutil cp failed:\n{result.stderr.strip()}")


def main() -> None:
    print(f"Project  : {PROJECT}")
    print(f"Dataset  : {DATASET}")
    print(f"Bucket   : {BUCKET}")
    print(f"Range    : all available data")
    print()

    client = bigquery.Client(project=PROJECT)

    print("Querying BigQuery for hourly AQI averages...")
    df = client.query(build_query()).to_dataframe()

    if df.empty:
        print("No data returned. Ensure aqi_measurements has rows.")
        sys.exit(1)

    cities = sorted(df["city"].unique())
    print(f"Retrieved {len(df):,} rows across {len(cities)} city/cities: {', '.join(cities)}")

    # Column order expected by Vertex AI AutoML Forecasting
    df = df[["timestamp", "city", "pm25", "pm10", "no2"]]

    # Format timestamp as ISO 8601 string (Vertex AI requirement)
    df["timestamp"] = pd.to_datetime(df["timestamp"]).dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Round pollutant values to 2 decimal places
    for col in ["pm25", "pm10", "no2"]:
        df[col] = df[col].round(2)

    run_stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    filename = f"aqi_training_{run_stamp}.csv"
    gcs_uri = f"gs://{BUCKET}/{GCS_OUTPUT_PREFIX}/{filename}"

    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as tmp:
        df.to_csv(tmp, index=False)
        tmp_path = tmp.name

    try:
        print(f"\nUploading {len(df):,} rows to {gcs_uri} ...")
        upload_to_gcs(tmp_path, gcs_uri)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    print(f"\nDone. Training CSV saved to:")
    print(f"  {gcs_uri}")
    print()
    print("AutoML training job parameters:")
    print(f"  training_data_path            = {gcs_uri}")
    print(f"  time_column                   = timestamp")
    print(f"  time_series_identifier_column = city")
    print(f"  target_column                 = pm25")
    print(f"  forecast_horizon              = 72  # hours")
    print(f"  context_window                = {len(df)}  # all available hourly rows")


if __name__ == "__main__":
    main()
