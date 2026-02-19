#!/usr/bin/env python3
"""
Ingest PM2.5 forecast data from the ADPC SERVIR Air Quality API into Firestore.

Source  : https://api-aq-servir.adpc.net
Target  : Firestore collection (default: adpc_pm25_regions)
Mode    : upsert by deterministic document id

Usage:
  ADPC_TOKEN=<token> python scripts/ingest_adpc_pm25_firestore.py
  ADPC_TOKEN=<token> python scripts/ingest_adpc_pm25_firestore.py --date 20260218
  ADPC_TOKEN=<token> python scripts/ingest_adpc_pm25_firestore.py --date 20260218 --hours 01:30 07:30

Env vars:
  ADPC_TOKEN            - ADPC API Authorization token (required)
  FIRESTORE_PROJECT     - GCP project for Firestore (default: aircare-sea)
  FIRESTORE_COLLECTION  - Firestore collection name (default: adpc_pm25_regions)
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
COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "adpc_pm25_regions")

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

DEFAULT_HOURS = ["01:30", "07:30", "13:30", "19:30"]


def fetch_pm25(area_id: int, init_date: str, forecast_hour: str) -> list[dict]:
    forecast_date = f"{init_date[:4]}-{init_date[4:6]}-{init_date[6:8]}+{forecast_hour}:00%2B00"
    url = (
        f"{API_BASE}?action=get-data-pm25-dash"
        f"&forecast_date={forecast_date}"
        f"&init_date={init_date}"
        f"&adm_lvl=country"
        f"&area_id={area_id}"
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
        print(f"    [WARN] area_id={area_id} hour={forecast_hour}: request failed - {exc}")
        return []

    if body.get("status") != "Success":
        print(f"    [WARN] area_id={area_id} hour={forecast_hour}: {body.get('message', 'no data')}")
        return []

    return body.get("data", [])


def parse_row(raw: list[Any], area_id: int, fetch_ts: str) -> dict:
    def safe(idx: int, cast=None, default=None):
        try:
            value = raw[idx]
            return cast(value) if (cast and value is not None) else value
        except (IndexError, TypeError, ValueError):
            return default

    return {
        "fetch_timestamp": fetch_ts,
        "forecast_datetime": safe(5),
        "init_date": safe(6),
        "area_id": area_id,
        "sub_area_id": safe(1, int),
        "area_name": safe(0),
        "country": safe(9),
        "latitude": safe(7, float),
        "longitude": safe(8, float),
        "pm25_value": safe(2, float),
        "pm25_max": safe(3, float),
        "pm25_avg": safe(4, float),
    }


def make_doc_id(row: dict) -> str:
    key = "|".join(
        [
            str(row.get("forecast_datetime") or ""),
            str(row.get("area_id") or ""),
            str(row.get("sub_area_id") or ""),
            str(row.get("area_name") or ""),
        ]
    )
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"{row.get('area_id', 'na')}_{row.get('sub_area_id', 'na')}_{digest}"


def write_to_firestore(rows: list[dict]) -> None:
    if not rows:
        print("No rows to write.")
        return

    db = firestore.Client(project=PROJECT)
    col = db.collection(COLLECTION)

    total = len(rows)
    written = 0
    batch = db.batch()
    batch_size = 0

    for row in rows:
        doc_ref = col.document(make_doc_id(row))
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
    parser = argparse.ArgumentParser(description="Ingest ADPC SERVIR PM2.5 data into Firestore")
    parser.add_argument(
        "--date",
        default=yesterday,
        help="Init date YYYYMMDD (default: yesterday UTC - API may lag by ~1 day)",
    )
    parser.add_argument(
        "--hours",
        nargs="+",
        default=DEFAULT_HOURS,
        help="Forecast hours to fetch e.g. 01:30 07:30 (default: all 4)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print sample rows only")
    return parser.parse_args()


def main() -> None:
    if not TOKEN:
        print("Error: ADPC_TOKEN env var is required.")
        print("  export ADPC_TOKEN='aq_admin.xxxxx'")
        sys.exit(1)

    args = parse_args()
    fetch_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"Init date  : {args.date}")
    print(f"Hours (UTC): {args.hours}")
    print(f"Countries  : {len(AREA_IDS)} ({', '.join(AREA_IDS.values())})")
    print(f"Target     : Firestore {PROJECT}/{COLLECTION}")
    print(f"Mode       : {'dry-run' if args.dry_run else 'live'}")
    print()

    all_rows: list[dict] = []

    for hour in args.hours:
        print(f"Fetching forecast hour {hour} UTC...")
        for area_id, country in AREA_IDS.items():
            raw_rows = fetch_pm25(area_id, args.date, hour)
            parsed = [parse_row(row, area_id, fetch_ts) for row in raw_rows]
            all_rows.extend(parsed)
            print(f"  {country:15s}  {len(parsed):3d} region(s)")
            time.sleep(0.2)
        print()

    print(f"Total rows fetched: {len(all_rows)}")

    if args.dry_run:
        print("\n[dry-run] First 3 rows:")
        for row in all_rows[:3]:
            print(" ", row)
        return

    write_to_firestore(all_rows)


if __name__ == "__main__":
    main()
