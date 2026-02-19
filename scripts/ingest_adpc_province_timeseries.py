#!/usr/bin/env python3
"""
Ingest province-level PM2.5 time-series from the ADPC SERVIR Air Quality API
into BigQuery.

Source  : https://api-aq-servir.adpc.net  (satellite-based PM2.5 forecasts)
Endpoint: action=get-city-pm25-timeseries  adm_lvl=province
Coverage: 11 Southeast Asian countries, province level, 3-day time series
Target  : {BQ_PROJECT}.{BQ_DATASET}.adpc_pm25_province_timeseries  (WRITE_APPEND)

Each run fetches all 11 countries for one init_date.
Each country returns ~48 rows (2 provinces × 24 forecast steps over 3 days).
Duplicate init_dates are blocked by a pre-flight check; use --force to override.

Array layout per row:
  [0] sub_area_id       int     Province identifier
  [1] pm25_value        float   PM2.5 reading
  [2] area_id           int     Country index (1–11)
  [3] forecast_datetime str     ISO  e.g. "2026-02-18T01:30:00Z"
  [4] init_date         str     e.g. "2026-02-18"

Usage:
  ADPC_TOKEN=<token> BQ_PROJECT=aircare-sea python scripts/ingest_adpc_province_timeseries.py
  ADPC_TOKEN=<token> BQ_PROJECT=aircare-sea python scripts/ingest_adpc_province_timeseries.py --date 20260218
  ADPC_TOKEN=<token> BQ_PROJECT=aircare-sea python scripts/ingest_adpc_province_timeseries.py --dry-run

Env vars:
  ADPC_TOKEN    - API Authorization token (required)
  BQ_PROJECT    - GCP project ID      (default: aircare-sea)
  BQ_DATASET    - BigQuery dataset    (default: aircare_sea)
  BQ_TABLE      - BigQuery table      (default: adpc_pm25_province_timeseries)
"""

import argparse
import os
import sys
import time
import urllib.request
import json
from datetime import datetime, timezone, timedelta
from google.cloud import bigquery
from google.cloud.bigquery import SchemaField, LoadJobConfig, WriteDisposition

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

TOKEN   = os.environ.get("ADPC_TOKEN", "")
PROJECT = os.environ.get("BQ_PROJECT", "aircare-sea")
DATASET = os.environ.get("BQ_DATASET", "aircare_sea")
TABLE   = os.environ.get("BQ_TABLE",   "adpc_pm25_province_timeseries")

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

SCHEMA = [
    SchemaField("fetch_timestamp",   "TIMESTAMP", mode="REQUIRED"),
    SchemaField("forecast_datetime", "TIMESTAMP", mode="NULLABLE"),
    SchemaField("init_date",         "DATE",      mode="NULLABLE"),
    SchemaField("area_id",           "INTEGER",   mode="NULLABLE"),
    SchemaField("sub_area_id",       "INTEGER",   mode="NULLABLE"),
    SchemaField("country",           "STRING",    mode="NULLABLE"),
    SchemaField("pm25_value",        "FLOAT",     mode="NULLABLE"),
]


# ---------------------------------------------------------------------------
# API fetch
# ---------------------------------------------------------------------------

def fetch_province_timeseries(area_id: int, init_date: str) -> list:
    """
    Fetch province-level PM2.5 time series for one country.
    Returns the full 3-day forecast series (~48 rows).
    """
    url = (
        f"{API_BASE}?action=get-city-pm25-timeseries"
        f"&area_id={area_id}"
        f"&init_date={init_date}"
        f"&adm_lvl=province"
    )
    req = urllib.request.Request(url, headers={
        "Authorization": TOKEN,
        "Accept": "application/json",
        "User-Agent": "AirCareSEA/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = json.loads(r.read())
    except Exception as exc:
        print(f"    [WARN] area_id={area_id}: request failed — {exc}")
        return []

    if body.get("status") != "Success":
        print(f"    [WARN] area_id={area_id}: {body.get('message', 'no data')}")
        return []

    return body.get("data", [])


def parse_row(raw: list, country: str, fetch_ts: str) -> dict:
    """
    Map the positional array to named fields.

    Array layout:
      [0] sub_area_id       int
      [1] pm25_value        float
      [2] area_id           int
      [3] forecast_datetime str  ISO e.g. "2026-02-18T01:30:00Z"
      [4] init_date         str  e.g. "2026-02-18"
    """
    def safe(idx, cast=None, default=None):
        try:
            v = raw[idx]
            return cast(v) if (cast and v is not None) else v
        except (IndexError, TypeError, ValueError):
            return default

    return {
        "fetch_timestamp":   fetch_ts,
        "forecast_datetime": safe(3),
        "init_date":         safe(4),
        "area_id":           safe(2, int),
        "sub_area_id":       safe(0, int),
        "country":           country,
        "pm25_value":        safe(1, float),
    }


# ---------------------------------------------------------------------------
# BigQuery helpers
# ---------------------------------------------------------------------------

def already_loaded(init_date: str) -> bool:
    """Return True if rows for this init_date already exist in the table."""
    bq_date = f"{init_date[:4]}-{init_date[4:6]}-{init_date[6:]}"
    try:
        client = bigquery.Client(project=PROJECT)
        query = f"""
            SELECT COUNT(*) AS n
            FROM `{PROJECT}.{DATASET}.{TABLE}`
            WHERE init_date = '{bq_date}'
        """
        row = next(iter(client.query(query).result()))
        return row.n > 0
    except Exception:
        return False


def load_to_bigquery(rows: list[dict]) -> None:
    if not rows:
        print("No rows to load.")
        return

    import pandas as pd

    client    = bigquery.Client(project=PROJECT)
    table_ref = f"{PROJECT}.{DATASET}.{TABLE}"

    job_config = LoadJobConfig(
        schema=SCHEMA,
        write_disposition=WriteDisposition.WRITE_APPEND,
    )

    df = pd.DataFrame(rows)
    df["fetch_timestamp"]   = pd.to_datetime(df["fetch_timestamp"],   utc=True, errors="coerce")
    df["forecast_datetime"] = pd.to_datetime(df["forecast_datetime"], utc=True, errors="coerce")
    df["init_date"]         = pd.to_datetime(df["init_date"], errors="coerce").dt.date

    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()

    table = client.get_table(table_ref)
    print(f"\nLoaded {len(rows)} rows → {table_ref}  (total: {table.num_rows:,})")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y%m%d")
    parser = argparse.ArgumentParser(
        description="Ingest ADPC SERVIR province-level PM2.5 time series into BigQuery"
    )
    parser.add_argument("--date", default=yesterday,
                        help="Init date YYYYMMDD (default: yesterday UTC — API has ~1-day lag)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print rows without loading to BigQuery")
    parser.add_argument("--force", action="store_true",
                        help="Load even if rows for this init_date already exist")
    return parser.parse_args()


def main() -> None:
    if not TOKEN:
        print("Error: ADPC_TOKEN env var is required.")
        print("  export ADPC_TOKEN='aq_admin.xxxxx'")
        sys.exit(1)

    args = parse_args()
    fetch_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"Init date  : {args.date}")
    print(f"Countries  : {len(AREA_IDS)} ({', '.join(AREA_IDS.values())})")
    print(f"Target     : {PROJECT}.{DATASET}.{TABLE}")
    print(f"Mode       : {'dry-run' if args.dry_run else 'live'}")
    print()

    if not args.dry_run and not args.force and already_loaded(args.date):
        print(f"Skipping: init_date={args.date} already exists in {PROJECT}.{DATASET}.{TABLE}")
        print("Use --force to overwrite.")
        sys.exit(0)

    all_rows: list[dict] = []

    for area_id, country in AREA_IDS.items():
        raw_rows = fetch_province_timeseries(area_id, args.date)
        parsed   = [parse_row(r, country, fetch_ts) for r in raw_rows]
        all_rows.extend(parsed)
        print(f"  {country:15s}  {len(parsed):3d} row(s)")
        time.sleep(0.2)

    print(f"\nTotal rows fetched: {len(all_rows)}")

    if args.dry_run:
        print("\n[dry-run] First 5 rows:")
        for row in all_rows[:5]:
            print(" ", row)
        return

    load_to_bigquery(all_rows)

    print()
    print("Example BigQuery query:")
    bq_date = f"{args.date[:4]}-{args.date[4:6]}-{args.date[6:]}"
    print(f"  SELECT country, sub_area_id,")
    print(f"         ROUND(AVG(pm25_value), 2) AS avg_pm25,")
    print(f"         MIN(forecast_datetime)    AS first_forecast,")
    print(f"         MAX(forecast_datetime)    AS last_forecast")
    print(f"  FROM `{PROJECT}.{DATASET}.{TABLE}`")
    print(f"  WHERE init_date = '{bq_date}'")
    print(f"  GROUP BY country, sub_area_id")
    print(f"  ORDER BY avg_pm25 DESC")
    print(f"  LIMIT 20;")


if __name__ == "__main__":
    main()
