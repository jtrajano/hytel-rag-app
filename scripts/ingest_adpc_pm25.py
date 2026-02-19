#!/usr/bin/env python3
"""
Ingest PM2.5 forecast data from the ADPC SERVIR Air Quality API into BigQuery.

Source  : https://api-aq-servir.adpc.net  (satellite-based PM2.5 forecasts)
Coverage: 11 Southeast Asian countries, province/district level
Target  : {BQ_PROJECT}.{BQ_DATASET}.adpc_pm25_regions  (WRITE_APPEND)

Each run fetches all 11 countries for one or more forecast hours on a given
init_date and appends new rows. Duplicate (forecast_datetime, area_name) pairs
are deduplicated in BigQuery via a scheduled merge or simply by querying with
DISTINCT in the API layer.

Area IDs:
  1=Brunei  2=Indonesia  3=Cambodia  4=Laos     5=Myanmar
  6=Malaysia 7=Philippines 8=Singapore 9=Thailand 10=Timor-Leste 11=Vietnam

Usage:
  ADPC_TOKEN=<token> BQ_PROJECT=aircare-sea python scripts/ingest_adpc_pm25.py
  ADPC_TOKEN=<token> BQ_PROJECT=aircare-sea python scripts/ingest_adpc_pm25.py --date 20260218
  ADPC_TOKEN=<token> BQ_PROJECT=aircare-sea python scripts/ingest_adpc_pm25.py --date 20260218 --hours 01:30 07:30 13:30

Env vars:
  ADPC_TOKEN    - API Authorization token (required)
  BQ_PROJECT    - GCP project ID      (default: aircare-sea)
  BQ_DATASET    - BigQuery dataset    (default: aircare_sea)
  BQ_TABLE      - BigQuery table      (default: adpc_pm25_regions)
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

TOKEN = os.environ.get("ADPC_TOKEN", "")
PROJECT = os.environ.get("BQ_PROJECT", "aircare-sea")
DATASET = os.environ.get("BQ_DATASET", "aircare_sea")
TABLE = os.environ.get("BQ_TABLE", "adpc_pm25_regions")

API_BASE = "https://api-aq-servir.adpc.net/api/mapclient/"

# area_id → country name (1–11 are active SEA countries)
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

# Default forecast hours to fetch per init_date (UTC)
DEFAULT_HOURS = ["01:30", "07:30", "13:30", "19:30"]

SCHEMA = [
    SchemaField("fetch_timestamp",   "TIMESTAMP", mode="REQUIRED"),
    SchemaField("forecast_datetime", "TIMESTAMP", mode="NULLABLE"),
    SchemaField("init_date",         "DATE",      mode="NULLABLE"),
    SchemaField("area_id",           "INTEGER",   mode="NULLABLE"),
    SchemaField("sub_area_id",       "INTEGER",   mode="NULLABLE"),
    SchemaField("area_name",         "STRING",    mode="NULLABLE"),
    SchemaField("country",           "STRING",    mode="NULLABLE"),
    SchemaField("latitude",          "FLOAT",     mode="NULLABLE"),
    SchemaField("longitude",         "FLOAT",     mode="NULLABLE"),
    SchemaField("pm25_value",        "FLOAT",     mode="NULLABLE"),
    SchemaField("pm25_max",          "FLOAT",     mode="NULLABLE"),
    SchemaField("pm25_avg",          "FLOAT",     mode="NULLABLE"),
]


# ---------------------------------------------------------------------------
# API fetch
# ---------------------------------------------------------------------------

def fetch_pm25(area_id: int, init_date: str, forecast_hour: str) -> list[dict]:
    """
    Fetch PM2.5 data for one area + one forecast time.
    forecast_hour format: "HH:MM"  (e.g. "01:30")
    init_date format:     "YYYYMMDD"
    """
    forecast_date = f"{init_date[:4]}-{init_date[4:6]}-{init_date[6:8]}+{forecast_hour}:00%2B00"
    url = (
        f"{API_BASE}?action=get-data-pm25-dash"
        f"&forecast_date={forecast_date}"
        f"&init_date={init_date}"
        f"&adm_lvl=country"
        f"&area_id={area_id}"
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
        print(f"    [WARN] area_id={area_id} hour={forecast_hour}: request failed — {exc}")
        return []

    if body.get("status") != "Success":
        print(f"    [WARN] area_id={area_id} hour={forecast_hour}: {body.get('message', 'no data')}")
        return []

    return body.get("data", [])


def parse_row(raw: list, area_id: int, fetch_ts: str) -> dict:
    """
    Map the positional array from the API to named fields.

    Observed array layout:
      [0]  area_name         str
      [1]  sub_area_id       int
      [2]  pm25_value        float  (current / min reading)
      [3]  pm25_max          float
      [4]  pm25_avg          float
      [5]  forecast_datetime str    ISO e.g. "2026-02-18T01:30:00Z"
      [6]  init_date         str    e.g. "2026-02-18"
      [7]  latitude          float
      [8]  longitude         float
      [9]  country           str
      [10] flag              bool   (purpose unknown)
      [11] extra1            int
      [12] extra2            int
    """
    def safe(idx, cast=None, default=None):
        try:
            v = raw[idx]
            return cast(v) if (cast and v is not None) else v
        except (IndexError, TypeError, ValueError):
            return default

    return {
        "fetch_timestamp":   fetch_ts,
        "forecast_datetime": safe(5),
        "init_date":         safe(6),
        "area_id":           area_id,
        "sub_area_id":       safe(1, int),
        "area_name":         safe(0),
        "country":           safe(9),
        "latitude":          safe(7, float),
        "longitude":         safe(8, float),
        "pm25_value":        safe(2, float),
        "pm25_max":          safe(3, float),
        "pm25_avg":          safe(4, float),
    }


# ---------------------------------------------------------------------------
# BigQuery load
# ---------------------------------------------------------------------------

def already_loaded(init_date: str) -> bool:
    """Return True if rows for this init_date already exist in BigQuery."""
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
        # Table may not exist yet on first run — treat as not loaded
        return False


def load_to_bigquery(rows: list[dict]) -> None:
    if not rows:
        print("No rows to load.")
        return

    client = bigquery.Client(project=PROJECT)
    table_ref = f"{PROJECT}.{DATASET}.{TABLE}"

    job_config = LoadJobConfig(
        schema=SCHEMA,
        write_disposition=WriteDisposition.WRITE_APPEND,
    )

    import pandas as pd
    df = pd.DataFrame(rows)

    # Convert string fields to proper types so pyarrow can map them to BQ schema
    df["fetch_timestamp"]   = pd.to_datetime(df["fetch_timestamp"], utc=True, errors="coerce")
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
    parser = argparse.ArgumentParser(description="Ingest ADPC SERVIR PM2.5 data into BigQuery")
    parser.add_argument("--date",  default=yesterday,
                        help="Init date YYYYMMDD (default: yesterday UTC — API has ~1-day lag)")
    parser.add_argument("--hours", nargs="+", default=DEFAULT_HOURS,
                        help="Forecast hours to fetch e.g. 01:30 07:30 (default: all 4)")
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
    print(f"Hours (UTC): {args.hours}")
    print(f"Countries  : {len(AREA_IDS)} ({', '.join(AREA_IDS.values())})")
    print(f"Target     : {PROJECT}.{DATASET}.{TABLE}")
    print(f"Mode       : {'dry-run' if args.dry_run else 'live'}")
    print()

    if not args.dry_run and not args.force and already_loaded(args.date):
        print(f"Skipping: init_date={args.date} already exists in {PROJECT}.{DATASET}.{TABLE}")
        print("Use --force to overwrite.")
        sys.exit(0)

    all_rows: list[dict] = []

    for hour in args.hours:
        print(f"Fetching forecast hour {hour} UTC...")
        for area_id, country in AREA_IDS.items():
            raw_rows = fetch_pm25(area_id, args.date, hour)
            parsed = [parse_row(r, area_id, fetch_ts) for r in raw_rows]
            all_rows.extend(parsed)
            print(f"  {country:15s}  {len(parsed):3d} region(s)")
            time.sleep(0.2)   # be polite to the API
        print()

    print(f"Total rows fetched: {len(all_rows)}")

    if args.dry_run:
        print("\n[dry-run] First 3 rows:")
        for row in all_rows[:3]:
            print(" ", row)
        return

    load_to_bigquery(all_rows)

    print()
    print("Example BigQuery queries:")
    print(f"  -- Latest PM2.5 per country")
    print(f"  SELECT country, ROUND(AVG(pm25_avg), 2) AS avg_pm25")
    print(f"  FROM `{PROJECT}.{DATASET}.{TABLE}`")
    print(f"  WHERE DATE(forecast_datetime) = '{args.date[:4]}-{args.date[4:6]}-{args.date[6:]}'")
    print(f"  GROUP BY country ORDER BY avg_pm25 DESC;")


if __name__ == "__main__":
    main()
