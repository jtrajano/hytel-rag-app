#!/usr/bin/env python3
"""
Save RAG chunks + embeddings into Firestore for Native Vector Search.

Reads chunks.jsonl and embeddings.jsonl from GCS (or local files), joins them
by chunk ID, and writes flat documents into Firestore collection 'rag_chunks'.

Each Firestore document:
  {
    id:            "who-aqg-2021-factsheet_chunk_000",
    content:       "...",          # the raw chunk text (for RAG response)
    embedding:     Vector([...]),  # 768-dim, used by findNearest()
    doc_id:        "who-aqg-2021-factsheet",
    source_label:  "WHO Air Quality Guidelines 2021...",
    source_url:    "https://...",
    chunk_index:   0,
    total_chunks:  12,
    ingestion_date:"2026-02-19T..."
  }

To query (in the RAG service):
  collection.find_nearest(
      vector_field="embedding",
      query_vector=Vector(query_embedding),
      distance_measure=DistanceMeasure.COSINE,
      limit=5,
  )

Already-indexed docs are tracked in scripts/docs-firestore.json and skipped
on subsequent runs (incremental). Use --force to re-index everything.

Usage:
  GCS_BUCKET=aircare-sea-data FIRESTORE_PROJECT=aircare-sea python scripts/save_to_firestore.py
  GCS_BUCKET=aircare-sea-data FIRESTORE_PROJECT=aircare-sea python scripts/save_to_firestore.py --force

Env vars:
  GCS_BUCKET          - GCS bucket name              (default: aircare-sea-data)
  FIRESTORE_PROJECT   - GCP project ID               (default: aircare-sea)
  FIRESTORE_DATABASE  - Firestore database ID        (default: (default))
  FIRESTORE_COLLECTION- Firestore collection name    (default: rag_chunks)
  LOCAL_CHUNKS_FILE   - Read chunks.jsonl locally    (skips GCS download)
  LOCAL_EMBEDDINGS_FILE- Read embeddings.jsonl locally (skips GCS download)

Requirements:
  pip install google-cloud-firestore>=2.16.0

Before first run, create the vector index:
  gcloud firestore indexes composite create \\
    --project=aircare-sea \\
    --collection-group=rag_chunks \\
    --query-scope=COLLECTION \\
    --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}'
"""

import json
import os
import platform
import subprocess
import sys
import tempfile
from pathlib import Path

_SHELL = platform.system() == "Windows"

BUCKET = os.environ.get("GCS_BUCKET", "aircare-sea-data")
PROJECT = os.environ.get("FIRESTORE_PROJECT", "aircare-sea")
DATABASE = os.environ.get("FIRESTORE_DATABASE", "(default)")
COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "rag_chunks")
LOCAL_CHUNKS_FILE = os.environ.get("LOCAL_CHUNKS_FILE")
LOCAL_EMBEDDINGS_FILE = os.environ.get("LOCAL_EMBEDDINGS_FILE")

GCS_CHUNKS_PATH = f"gs://{BUCKET}/processed/chunks/chunks.jsonl"
GCS_EMBEDDINGS_PATH = f"gs://{BUCKET}/processed/embeddings/embeddings.jsonl"

STATE_FILE = Path(__file__).parent / "docs-firestore.json"

# Firestore batch write limit
BATCH_SIZE = 500

try:
    from google.cloud import firestore
    from google.cloud.firestore_v1.vector import Vector
    from google.cloud.firestore_v1.base_vector_query import DistanceMeasure  # noqa: F401
except ImportError:
    print("Missing dependency. Run: pip install 'google-cloud-firestore>=2.16.0'")
    sys.exit(1)


# ---------------------------------------------------------------------------
# State tracking
# ---------------------------------------------------------------------------

def load_indexed_ids() -> set[str]:
    if not STATE_FILE.exists():
        return set()
    data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return set(data.get("indexedIds", []))


def save_indexed_ids(ids: set[str]) -> None:
    existing = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    existing["indexedIds"] = sorted(ids)
    STATE_FILE.write_text(json.dumps(existing, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# GCS helpers
# ---------------------------------------------------------------------------

def run_gsutil(*args: str) -> str:
    result = subprocess.run(
        ["gsutil", *args],
        capture_output=True,
        text=True,
        shell=_SHELL,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gsutil {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout


def download_gcs_file(gcs_uri: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        run_gsutil("cp", gcs_uri, tmp_path)
        return Path(tmp_path).read_text(encoding="utf-8")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def load_jsonl(content: str) -> list[dict]:
    return [json.loads(ln) for ln in content.splitlines() if ln.strip()]


# ---------------------------------------------------------------------------
# Firestore helpers
# ---------------------------------------------------------------------------

def write_batch(db: firestore.Client, collection_name: str, docs: list[dict]) -> None:
    """Write a list of dicts to Firestore in batches of BATCH_SIZE."""
    for start in range(0, len(docs), BATCH_SIZE):
        batch = db.batch()
        chunk = docs[start : start + BATCH_SIZE]
        for doc in chunk:
            ref = db.collection(collection_name).document(doc["id"])
            batch.set(ref, doc)
        batch.commit()
        done = min(start + BATCH_SIZE, len(docs))
        print(f"  Wrote {done}/{len(docs)} documents", end="\r")
    print()  # newline after \r


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def print_index_command() -> None:
    print()
    print("=" * 60)
    print("IMPORTANT: Create the Firestore vector index before querying.")
    print("Run this command once:")
    print()
    print(f"  gcloud firestore indexes composite create \\")
    print(f"    --project={PROJECT} \\")
    print(f"    --collection-group={COLLECTION} \\")
    print(f"    --query-scope=COLLECTION \\")
    print(f"    --field-config=field-path=embedding,vector-config='{{\"dimension\":\"768\",\"flat\":\"{{}}\"}}'")
    print()
    print("Index creation takes ~5 minutes. Check status:")
    print(f"  gcloud firestore indexes composite list --project={PROJECT}")
    print("=" * 60)


def main() -> None:
    force = "--force" in sys.argv

    print(f"Project    : {PROJECT}")
    print(f"Database   : {DATABASE}")
    print(f"Collection : {COLLECTION}")
    print(f"Chunks     : {LOCAL_CHUNKS_FILE or GCS_CHUNKS_PATH}")
    print(f"Embeddings : {LOCAL_EMBEDDINGS_FILE or GCS_EMBEDDINGS_PATH}")
    print(f"Mode       : {'force (re-index all)' if force else 'incremental (skip already indexed)'}")
    print()

    indexed_ids = set() if force else load_indexed_ids()
    if indexed_ids:
        print(f"Already indexed: {len(indexed_ids)} doc(s) — will skip these")
        print()

    # Load chunks
    if LOCAL_CHUNKS_FILE:
        chunks_raw = Path(LOCAL_CHUNKS_FILE).read_text(encoding="utf-8")
    else:
        print(f"Downloading {GCS_CHUNKS_PATH} ...")
        chunks_raw = download_gcs_file(GCS_CHUNKS_PATH)

    chunks_by_id = {c["id"]: c for c in load_jsonl(chunks_raw)}
    print(f"Loaded {len(chunks_by_id)} chunk(s)")

    # Load embeddings
    if LOCAL_EMBEDDINGS_FILE:
        embeddings_raw = Path(LOCAL_EMBEDDINGS_FILE).read_text(encoding="utf-8")
    else:
        print(f"Downloading {GCS_EMBEDDINGS_PATH} ...")
        embeddings_raw = download_gcs_file(GCS_EMBEDDINGS_PATH)

    embeddings_by_id = {e["id"]: e["embedding"] for e in load_jsonl(embeddings_raw)}
    print(f"Loaded {len(embeddings_by_id)} embedding(s)")
    print()

    # Join chunks + embeddings, filter already-indexed docs
    firestore_docs: list[dict] = []
    missing_embeddings = 0

    for chunk_id, chunk in chunks_by_id.items():
        doc_id = chunk.get("metadata", {}).get("doc_id", "")
        if doc_id in indexed_ids:
            continue

        embedding = embeddings_by_id.get(chunk_id)
        if embedding is None:
            missing_embeddings += 1
            continue

        meta = chunk.get("metadata", {})
        firestore_docs.append({
            "id": chunk_id,
            "content": chunk["content"],
            "embedding": Vector(embedding),
            "doc_id": meta.get("doc_id", ""),
            "source_label": meta.get("source_label", ""),
            "source_url": meta.get("source_url", ""),
            "chunk_index": meta.get("chunk_index", 0),
            "total_chunks": meta.get("total_chunks", 0),
            "ingestion_date": meta.get("ingestion_date", ""),
        })

    if missing_embeddings:
        print(f"Warning: {missing_embeddings} chunk(s) had no matching embedding — skipped.")
        print("         Run `pnpm embed:docs` first if this is unexpected.\n")

    if not firestore_docs:
        print("All documents already indexed in Firestore. Nothing to do.")
        print("Use --force to re-index everything.")
        print_index_command()
        return

    doc_ids_in_batch: set[str] = {d["doc_id"] for d in firestore_docs}
    print(f"Writing {len(firestore_docs)} document(s) across {len(doc_ids_in_batch)} doc(s) to Firestore...")

    db = firestore.Client(project=PROJECT, database=DATABASE)
    write_batch(db, COLLECTION, firestore_docs)

    # Update state
    if force:
        save_indexed_ids(doc_ids_in_batch)
    else:
        save_indexed_ids(indexed_ids | doc_ids_in_batch)

    total_indexed = len(indexed_ids | doc_ids_in_batch)
    print(f"\nDone. {len(firestore_docs)} document(s) saved to Firestore.")
    print(f"  Collection : {PROJECT}/{DATABASE}/{COLLECTION}")
    print(f"  ({total_indexed} total doc(s) tracked in {STATE_FILE.name})")

    print_index_command()


if __name__ == "__main__":
    main()
