#!/usr/bin/env python3
"""
Load the Kaggle Global Air Pollution Dataset (2025-2026) into Firestore.

Source  : Kaggle "Global Air Pollution Data 2025-2026"
Columns : Date, City (as "City, Country"), Latitude, Longitude, PM2.5, PM10,
          NO2, SO2, CO, Ozone, Aerosol_Optical_Depth, AQI_Class
Target  : Firestore collection (default: global_aqi_reference)
Strategy: replace collection by default (similar to WRITE_TRUNCATE)

Usage:
  python scripts/load_kaggle_aqi_firestore.py
  KAGGLE_CSV=/local/path/file.csv python scripts/load_kaggle_aqi_firestore.py
  KAGGLE_CSV=gs://bucket/path.csv python scripts/load_kaggle_aqi_firestore.py --append

Env vars:
  KAGGLE_CSV            - GCS path (gs://...) or local CSV path
                          (default: gs://aircare-sea-data/raw/csv/kaggle-gp-dataset.csv)
  FIRESTORE_PROJECT     - GCP project ID (default: aircare-sea)
  FIRESTORE_COLLECTION  - Firestore collection name (default: global_aqi_reference)
"""

import argparse
import hashlib
import io
import os
import sys
from datetime import timezone
from pathlib import Path

import pandas as pd
from google.cloud import firestore, storage

DEFAULT_CSV = "gs://aircare-sea-data/raw/csv/kaggle-gp-dataset.csv"

KAGGLE_CSV = os.environ.get("KAGGLE_CSV", DEFAULT_CSV)
PROJECT = os.environ.get("FIRESTORE_PROJECT", "aircare-sea")
COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "global_aqi_reference")

COLUMN_MAP = {
    "Date": "timestamp",
    "City": "city_raw",
    "Latitude": "latitude",
    "Longitude": "longitude",
    "PM2.5": "pm25",
    "PM10": "pm10",
    "NO2": "no2",
    "SO2": "so2",
    "CO": "co",
    "Ozone": "ozone",
    "Aerosol_Optical_Depth": "aerosol_optical_depth",
    "AQI_Class": "aqi_class",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load Kaggle AQI CSV into Firestore")
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append/upsert docs without deleting existing collection documents",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse CSV and print summary only (no Firestore writes)",
    )
    return parser.parse_args()


def _read_bytes(path: str) -> io.BytesIO:
    if path.startswith("gs://"):
        without_scheme = path[len("gs://") :]
        bucket_name, _, blob_name = without_scheme.partition("/")
        print(f"Downloading from GCS: gs://{bucket_name}/{blob_name}")
        gcs = storage.Client(project=PROJECT)
        blob = gcs.bucket(bucket_name).blob(blob_name)
        return io.BytesIO(blob.download_as_bytes())

    local = Path(path)
    if not local.exists():
        print(f"CSV not found: {local}")
        print("Set KAGGLE_CSV env var to the correct path.")
        sys.exit(1)
    return io.BytesIO(local.read_bytes())


def load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(_read_bytes(path), encoding="utf-8-sig")
    df.rename(columns=COLUMN_MAP, inplace=True)

    split = df["city_raw"].astype(str).str.rsplit(",", n=1, expand=True)
    df["city"] = split[0].str.strip()
    df["country"] = split[1].str.strip() if split.shape[1] > 1 else ""
    df.drop(columns=["city_raw"], inplace=True)

    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")

    float_cols = [
        "latitude",
        "longitude",
        "pm25",
        "pm10",
        "no2",
        "so2",
        "co",
        "ozone",
        "aerosol_optical_depth",
    ]
    for col in float_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    return df[
        [
            "timestamp",
            "city",
            "country",
            "latitude",
            "longitude",
            "pm25",
            "pm10",
            "no2",
            "so2",
            "co",
            "ozone",
            "aerosol_optical_depth",
            "aqi_class",
        ]
    ]


def _doc_id(row: dict) -> str:
    key = "|".join(
        [
            str(row.get("timestamp", "")),
            str(row.get("city", "")),
            str(row.get("country", "")),
        ]
    )
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:24]


def delete_collection(db: firestore.Client, name: str, page_size: int = 500) -> int:
    deleted = 0
    col = db.collection(name)

    while True:
        docs = list(col.limit(page_size).stream())
        if not docs:
            break
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        deleted += len(docs)
        print(f"Deleted {deleted} docs...")

    return deleted


def write_rows(db: firestore.Client, name: str, rows: list[dict]) -> int:
    col = db.collection(name)
    total = len(rows)
    written = 0
    batch = db.batch()
    batch_size = 0

    for row in rows:
        ref = col.document(_doc_id(row))
        batch.set(ref, row, merge=True)
        batch_size += 1

        if batch_size == 500:
            batch.commit()
            written += batch_size
            print(f"Written {written}/{total} docs...")
            batch = db.batch()
            batch_size = 0

    if batch_size > 0:
        batch.commit()
        written += batch_size

    return written


def main() -> None:
    args = parse_args()

    print(f"Source   : {KAGGLE_CSV}")
    print(f"Target   : Firestore {PROJECT}/{COLLECTION}")
    print(f"Strategy : {'APPEND/UPSERT' if args.append else 'REPLACE COLLECTION'}")
    print()

    print("Reading CSV...")
    df = load_csv(KAGGLE_CSV)
    print(f"Loaded {len(df):,} rows, {len(df.columns)} columns")
    print(f"Date range: {df['timestamp'].min()} -> {df['timestamp'].max()}")
    print(f"Cities ({df['city'].nunique()}): {', '.join(sorted(df['city'].dropna().unique()))}")
    print()

    rows: list[dict] = []
    for record in df.to_dict(orient="records"):
        ts = record["timestamp"]
        record["timestamp"] = (
            ts.tz_convert(timezone.utc).isoformat().replace("+00:00", "Z")
            if pd.notna(ts)
            else None
        )
        rows.append(record)

    if args.dry_run:
        print("[dry-run] First 3 rows:")
        for row in rows[:3]:
            print(" ", row)
        return

    db = firestore.Client(project=PROJECT)

    if not args.append:
        print("Deleting existing documents...")
        deleted = delete_collection(db, COLLECTION)
        print(f"Deleted {deleted:,} existing docs")

    print("Writing documents...")
    written = write_rows(db, COLLECTION, rows)
    print(f"\nDone. Upserted {written:,} docs into {PROJECT}/{COLLECTION}")


if __name__ == "__main__":
    main()
