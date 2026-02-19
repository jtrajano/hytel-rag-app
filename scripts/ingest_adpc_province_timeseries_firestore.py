#!/usr/bin/env python3
"""
Ingest province-level PM2.5 time-series from the ADPC SERVIR Air Quality API
into Firestore.

Source  : https://api-aq-servir.adpc.net
Endpoint: action=get-city-pm25-timeseries  adm_lvl=province
Coverage: 11 Southeast Asian countries, province level, 3-day time series
Target  : Firestore collection adpc_pm25_province_timeseries (upsert by doc id)

Array layout per row:
  [0] sub_area_id       int
  [1] pm25_value        float
  [2] area_id           int
  [3] forecast_datetime str  ISO e.g. "2026-02-18T01:30:00Z"
  [4] init_date         str  e.g. "2026-02-18"

Usage:
  ADPC_TOKEN=<token> python scripts/ingest_adpc_province_timeseries_firestore.py
  ADPC_TOKEN=<token> python scripts/ingest_adpc_province_timeseries_firestore.py --date 20260218
  ADPC_TOKEN=<token> python scripts/ingest_adpc_province_timeseries_firestore.py --dry-run

Env vars:
  ADPC_TOKEN            - API Authorization token (required)
  FIRESTORE_PROJECT     - GCP project ID (default: aircare-sea)
  FIRESTORE_COLLECTION  - Firestore collection (default: adpc_pm25_province_timeseries)
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import Any

from google.cloud import firestore

TOKEN = os.environ.get("ADPC_TOKEN", "")
PROJECT = os.environ.get("FIRESTORE_PROJECT", "aircare-sea")
COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "adpc_pm25_province_timeseries")

API_BASE = "https://api-aq-servir.adpc.net/api/mapclient/"

AREA_IDS = {
    1: "Brunei",
    2: "Indonesia",
    3: "Cambodia",
    4: "Laos",
    5: "Myanmar",
    6: "Malaysia",
    7: "Philippines",
    8: "Singapore",
    9: "Thailand",
    10: "Timor-Leste",
    11: "Vietnam",
}


def fetch_province_timeseries(area_id: int, init_date: str) -> list:
    url = (
        f"{API_BASE}?action=get-city-pm25-timeseries"
        f"&area_id={area_id}"
        f"&init_date={init_date}"
        f"&adm_lvl=province"
    )
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": TOKEN,
            "Accept": "application/json",
            "User-Agent": "AirCareSEA/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            body = json.loads(response.read())
    except Exception as exc:
        print(f"    [WARN] area_id={area_id}: request failed - {exc}")
        return []

    if body.get("status") != "Success":
        print(f"    [WARN] area_id={area_id}: {body.get('message', 'no data')}")
        return []

    return body.get("data", [])


def parse_row(raw: list[Any], country: str, fetch_ts: str) -> dict:
    def safe(idx: int, cast=None, default=None):
        try:
            value = raw[idx]
            return cast(value) if (cast and value is not None) else value
        except (IndexError, TypeError, ValueError):
            return default

    return {
        "fetch_timestamp": fetch_ts,
        "forecast_datetime": safe(3),
        "init_date": safe(4),
        "area_id": safe(2, int),
        "sub_area_id": safe(0, int),
        "country": country,
        "pm25_value": safe(1, float),
    }


def make_doc_id(row: dict) -> str:
    key = "|".join(
        [
            str(row.get("init_date") or ""),
            str(row.get("forecast_datetime") or ""),
            str(row.get("area_id") or ""),
            str(row.get("sub_area_id") or ""),
        ]
    )
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"{row.get('area_id', 'na')}_{row.get('sub_area_id', 'na')}_{digest}"


def already_loaded(db: firestore.Client, init_date: str) -> bool:
    iso_date = f"{init_date[:4]}-{init_date[4:6]}-{init_date[6:]}"
    query = db.collection(COLLECTION).where("init_date", "==", iso_date).limit(1)
    return next(query.stream(), None) is not None


def write_to_firestore(db: firestore.Client, rows: list[dict]) -> None:
    if not rows:
        print("No rows to write.")
        return

    total = len(rows)
    written = 0
    batch = db.batch()
    batch_size = 0

    for row in rows:
        doc_ref = db.collection(COLLECTION).document(make_doc_id(row))
        batch.set(doc_ref, row, merge=True)
        batch_size += 1

        if batch_size == 500:
            batch.commit()
            written += batch_size
            print(f"Committed {written}/{total} documents...")
            batch = db.batch()
            batch_size = 0

    if batch_size > 0:
        batch.commit()
        written += batch_size

    print(f"\nUpserted {written} documents -> {PROJECT}/{COLLECTION}")


def parse_args() -> argparse.Namespace:
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y%m%d")
    parser = argparse.ArgumentParser(
        description="Ingest ADPC SERVIR province-level PM2.5 time series into Firestore"
    )
    parser.add_argument(
        "--date",
        default=yesterday,
        help="Init date YYYYMMDD (default: yesterday UTC - API has ~1-day lag)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print rows without writing to Firestore",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Write even if rows for this init_date already exist",
    )
    return parser.parse_args()


def main() -> None:
    if not TOKEN:
        print("Error: ADPC_TOKEN env var is required.")
        print("  export ADPC_TOKEN='aq_admin.xxxxx'")
        sys.exit(1)

    args = parse_args()
    fetch_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    db = firestore.Client(project=PROJECT)

    print(f"Init date  : {args.date}")
    print(f"Countries  : {len(AREA_IDS)} ({', '.join(AREA_IDS.values())})")
    print(f"Target     : Firestore {PROJECT}/{COLLECTION}")
    print(f"Mode       : {'dry-run' if args.dry_run else 'live'}")
    print()

    if not args.dry_run and not args.force and already_loaded(db, args.date):
        print(f"Skipping: init_date={args.date} already exists in {PROJECT}/{COLLECTION}")
        print("Use --force to overwrite.")
        sys.exit(0)

    all_rows: list[dict] = []

    for area_id, country in AREA_IDS.items():
        raw_rows = fetch_province_timeseries(area_id, args.date)
        parsed = [parse_row(row, country, fetch_ts) for row in raw_rows]
        all_rows.extend(parsed)
        print(f"  {country:15s}  {len(parsed):3d} row(s)")
        time.sleep(0.2)

    print(f"\nTotal rows fetched: {len(all_rows)}")

    if args.dry_run:
        print("\n[dry-run] First 5 rows:")
        for row in all_rows[:5]:
            print(" ", row)
        return

    write_to_firestore(db, all_rows)


if __name__ == "__main__":
    main()
