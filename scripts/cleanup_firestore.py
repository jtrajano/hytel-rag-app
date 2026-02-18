#!/usr/bin/env python3
"""
Remove off-topic / low-quality doc chunks from Firestore and tracking files.

Deletes all rag_chunks documents whose doc_id matches the blocklist, then
removes those IDs from docs-chunked.json, docs-embedded.json, and
docs-firestore.json so they won't be re-indexed.

Usage:
  FIRESTORE_PROJECT=aircare-sea python scripts/cleanup_firestore.py
  FIRESTORE_PROJECT=aircare-sea python scripts/cleanup_firestore.py --dry-run

Env vars:
  FIRESTORE_PROJECT   - GCP project ID            (default: aircare-sea)
  FIRESTORE_DATABASE  - Firestore database ID     (default: (default))
  FIRESTORE_COLLECTION- Firestore collection name (default: rag_chunks)
"""

import json
import os
import sys
from pathlib import Path

PROJECT = os.environ.get("FIRESTORE_PROJECT", "aircare-sea")
DATABASE = os.environ.get("FIRESTORE_DATABASE", "(default)")
COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "rag_chunks")

# Doc IDs to remove from Firestore.
# Keeping only the 10 prose health guideline docs for clean RAG results.
BLOCKLIST: list[str] = [
    # --- Off-topic: completely unrelated to air quality ---
    # Alcohol DALY statistics — scraped by accident from WHO GHO data explorer
    "who-alcohol-attributable-dalys---age-standardized-rates",
    "who-percent-of-all-dalys-attributable-to-alcohol",
    "who-alcohol-attributable-dalys-lost-from-all-causes-(all-ages)-(number)",
    # WASH services mortality — unrelated to air pollution
    "who-mortality-rate-attributed-to-exposure-to-unsafe-wash-services-(per-100-000-population)-(sdg-3-9-2)",
    # Poison control — unrelated to air pollution
    "who-poison-control-and-unintentional-poisoning",

    # --- Borderline: WHO GHO statistical data pages (numeric tables, not prose guidelines) ---
    # Air quality database landing/update pages — contain stats rows, not health advice
    "who-air-quality-database-2018",
    "who-air-quality-database-2022",
    "who-air-quality-database-2024",
    # GHO indicator pages — raw numbers per country/year, useless for health Q&A
    "who-concentrations-of-fine-particulate-matter-(pm2-5)",
    "who-air-pollution-attributable-deaths",
    "who-air-pollution-attributable-death-rate-(per-100-000-population-age-standardized)",
    "who-air-pollution-attributable-dalys",
    "who-ambient-and-household-air-pollution-attributable-deaths",
    "who-ambient-and-household-air-pollution-attributable-death-rate-(per-100-000-population-age-standardized)",
]

TRACKING_FILES = [
    Path(__file__).parent / "docs-chunked.json",
    Path(__file__).parent / "docs-embedded.json",
    Path(__file__).parent / "docs-firestore.json",
]

# Key name inside each tracking file that holds the list of IDs
TRACKING_KEYS = {
    "docs-chunked.json": "chunkedIds",
    "docs-embedded.json": "embeddedIds",
    "docs-firestore.json": "indexedIds",
}

try:
    from google.cloud import firestore
except ImportError:
    print("Run: pip install 'google-cloud-firestore>=2.16.0'")
    sys.exit(1)


def delete_by_doc_id(
    db: firestore.Client,
    collection: str,
    doc_id: str,
    dry_run: bool,
) -> int:
    """Delete all chunks in collection where doc_id == doc_id. Returns count."""
    docs = list(db.collection(collection).where("doc_id", "==", doc_id).stream())

    if not docs:
        return 0

    if dry_run:
        print(f"  [dry-run] would delete {len(docs)} chunk(s) for '{doc_id}'")
        return len(docs)

    # Batch deletes (max 500 per commit)
    batch_size = 500
    deleted = 0
    for start in range(0, len(docs), batch_size):
        batch = db.batch()
        for doc in docs[start : start + batch_size]:
            batch.delete(doc.reference)
        batch.commit()
        deleted += len(docs[start : start + batch_size])

    print(f"  Deleted {deleted} chunk(s) for '{doc_id}'")
    return deleted


def clean_tracking_file(path: Path, ids_to_remove: set[str], dry_run: bool) -> None:
    if not path.exists():
        return

    key = TRACKING_KEYS.get(path.name)
    if not key:
        return

    data = json.loads(path.read_text(encoding="utf-8"))
    before = set(data.get(key, []))
    after = before - ids_to_remove
    removed = before & ids_to_remove

    if not removed:
        print(f"  {path.name}: nothing to remove")
        return

    if dry_run:
        print(f"  [dry-run] {path.name}: would remove {sorted(removed)}")
        return

    data[key] = sorted(after)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"  {path.name}: removed {len(removed)} ID(s)")


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    print(f"Project    : {PROJECT}")
    print(f"Database   : {DATABASE}")
    print(f"Collection : {COLLECTION}")
    print(f"Mode       : {'DRY RUN (no changes)' if dry_run else 'LIVE (will delete)'}")
    print()
    print(f"Docs to remove ({len(BLOCKLIST)}):")
    for doc_id in BLOCKLIST:
        print(f"  - {doc_id}")
    print()

    # --- Firestore cleanup ---
    print("Connecting to Firestore...")
    db = firestore.Client(project=PROJECT, database=DATABASE)

    total_deleted = 0
    print("Deleting chunks from Firestore...")
    for doc_id in BLOCKLIST:
        total_deleted += delete_by_doc_id(db, COLLECTION, doc_id, dry_run)

    print(f"{'[dry-run] would delete' if dry_run else 'Deleted'} {total_deleted} total chunk(s)\n")

    # --- Tracking file cleanup ---
    print("Updating tracking files...")
    blocklist_set = set(BLOCKLIST)
    for path in TRACKING_FILES:
        clean_tracking_file(path, blocklist_set, dry_run)

    print()
    if dry_run:
        print("Dry run complete. Re-run without --dry-run to apply changes.")
    else:
        print("Done. Off-topic docs removed from Firestore and all tracking files.")
        print("The remaining collection contains only air quality health guideline chunks.")


if __name__ == "__main__":
    main()
