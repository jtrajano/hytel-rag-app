#!/usr/bin/env python3
"""
Generate embeddings for RAG chunks using Vertex AI text-embedding-004.

Reads chunks.jsonl from GCS (or LOCAL_CHUNKS_FILE), calls text-embedding-004
in batches, and appends results to:
  gs://{GCS_BUCKET}/processed/embeddings/embeddings.jsonl

Each output line:
  {"id": "chunk_id", "embedding": [<768 floats>]}

Already-embedded docs are tracked in scripts/docs-embedded.json and skipped
on subsequent runs (incremental). Use --force to re-embed everything.

Usage:
  GCS_BUCKET=aircare-sea-data VERTEX_PROJECT=aircare-sea python scripts/generate_embeddings.py
  GCS_BUCKET=aircare-sea-data VERTEX_PROJECT=aircare-sea python scripts/generate_embeddings.py --force

Env vars:
  GCS_BUCKET         - GCS bucket name          (default: aircare-sea-data)
  VERTEX_PROJECT     - GCP project ID           (default: aircare-sea)
  VERTEX_LOCATION    - Vertex AI region         (default: us-central1)
  BATCH_SIZE         - Chunks per API call      (default: 5)
  LOCAL_CHUNKS_FILE  - Read chunks.jsonl locally instead of GCS

Requirements:
  pip install google-cloud-aiplatform
"""

import json
import os
import platform
import subprocess
import sys
import tempfile
import time
from pathlib import Path

_SHELL = platform.system() == "Windows"

BUCKET = os.environ.get("GCS_BUCKET", "aircare-sea-data")
PROJECT = os.environ.get("VERTEX_PROJECT", "aircare-sea")
LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "5"))
LOCAL_CHUNKS_FILE = os.environ.get("LOCAL_CHUNKS_FILE")

GCS_CHUNKS_PATH = f"gs://{BUCKET}/processed/chunks/chunks.jsonl"
GCS_OUTPUT_PATH = f"gs://{BUCKET}/processed/embeddings/embeddings.jsonl"

STATE_FILE = Path(__file__).parent / "docs-embedded.json"

try:
    import vertexai
    from vertexai.language_models import TextEmbeddingModel
except ImportError:
    print("Missing dependency. Run: pip install google-cloud-aiplatform")
    sys.exit(1)


# ---------------------------------------------------------------------------
# State tracking
# ---------------------------------------------------------------------------

def load_embedded_ids() -> set[str]:
    if not STATE_FILE.exists():
        return set()
    data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return set(data.get("embeddedIds", []))


def save_embedded_ids(ids: set[str]) -> None:
    existing = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    existing["embeddedIds"] = sorted(ids)
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


def gcs_file_exists(gcs_uri: str) -> bool:
    result = subprocess.run(
        ["gsutil", "-q", "stat", gcs_uri],
        capture_output=True,
        shell=_SHELL,
    )
    return result.returncode == 0


def download_gcs_file(gcs_uri: str, suffix: str = ".jsonl") -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
    try:
        run_gsutil("cp", gcs_uri, tmp_path)
        return Path(tmp_path).read_text(encoding="utf-8")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def append_lines_to_gcs(new_lines: list[str], gcs_uri: str) -> None:
    """Download existing JSONL (if any), append new lines, re-upload."""
    existing_lines: list[str] = []

    if gcs_file_exists(gcs_uri):
        print(f"  Downloading existing {gcs_uri} for append...")
        content = download_gcs_file(gcs_uri)
        existing_lines = [ln for ln in content.splitlines() if ln.strip()]

    all_lines = existing_lines + new_lines

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".jsonl", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write("\n".join(all_lines) + "\n")
        tmp_path = tmp.name

    try:
        run_gsutil("cp", tmp_path, gcs_uri)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

def embed_batch(model: TextEmbeddingModel, texts: list[str]) -> list[list[float]]:
    """Call text-embedding-004 for a batch of texts. Returns list of vectors."""
    results = model.get_embeddings(texts)
    return [r.values for r in results]


def generate_embeddings_for_chunks(
    model: TextEmbeddingModel,
    chunks: list[dict],
    batch_size: int,
) -> list[dict]:
    """
    Embed all chunks in batches.
    Returns list of {"id": str, "embedding": list[float]}.
    """
    output = []
    total = len(chunks)

    for start in range(0, total, batch_size):
        batch = chunks[start : start + batch_size]
        texts = [c["content"] for c in batch]

        try:
            vectors = embed_batch(model, texts)
        except Exception as exc:
            # Short backoff on transient errors then retry once
            print(f"    Batch {start // batch_size + 1} failed ({exc}), retrying in 5s...")
            time.sleep(5)
            vectors = embed_batch(model, texts)

        for chunk, vector in zip(batch, vectors):
            output.append({"id": chunk["id"], "embedding": vector})

        done = min(start + batch_size, total)
        print(f"  Embedded {done}/{total} chunks", end="\r")

        # Brief pause to stay within Vertex AI quota (60 req/min default)
        if done < total:
            time.sleep(0.5)

    print()  # newline after \r progress
    return output


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    force = "--force" in sys.argv

    print(f"Project    : {PROJECT}")
    print(f"Location   : {LOCATION}")
    print(f"Bucket     : {BUCKET}")
    print(f"Input      : {LOCAL_CHUNKS_FILE or GCS_CHUNKS_PATH}")
    print(f"Output     : {GCS_OUTPUT_PATH}")
    print(f"Batch size : {BATCH_SIZE}")
    print(f"Mode       : {'force (re-embed all)' if force else 'incremental (skip already embedded)'}")
    print()

    # Load state
    embedded_ids = set() if force else load_embedded_ids()
    if embedded_ids:
        print(f"Already embedded: {len(embedded_ids)} doc(s) — will skip these")
        print()

    # Load chunks
    if LOCAL_CHUNKS_FILE:
        raw = Path(LOCAL_CHUNKS_FILE).read_text(encoding="utf-8")
    else:
        print(f"Downloading chunks from {GCS_CHUNKS_PATH} ...")
        raw = download_gcs_file(GCS_CHUNKS_PATH)
        print()

    all_chunks = [json.loads(ln) for ln in raw.splitlines() if ln.strip()]
    print(f"Total chunks loaded: {len(all_chunks)}")

    # Filter to only unembedded docs
    new_chunks = [
        c for c in all_chunks
        if c.get("metadata", {}).get("doc_id") not in embedded_ids
    ]
    skipped = len(all_chunks) - len(new_chunks)
    print(f"Skipping {skipped} already-embedded chunk(s), embedding {len(new_chunks)} new chunk(s)")

    if not new_chunks:
        print("\nAll chunks already embedded. Nothing to do.")
        print("Use --force to re-embed everything.")
        return

    # Group by doc_id for progress reporting
    doc_ids_in_batch: set[str] = {
        c["metadata"]["doc_id"] for c in new_chunks if "metadata" in c
    }
    print(f"Docs to embed: {len(doc_ids_in_batch)}")
    print()

    # Init Vertex AI
    print("Initialising Vertex AI...")
    vertexai.init(project=PROJECT, location=LOCATION)
    model = TextEmbeddingModel.from_pretrained("text-embedding-004")
    print("Model ready: text-embedding-004 (768-dim)\n")

    # Generate embeddings
    print(f"Generating embeddings in batches of {BATCH_SIZE}...")
    embedding_records = generate_embeddings_for_chunks(model, new_chunks, BATCH_SIZE)
    print(f"Generated {len(embedding_records)} embedding(s)")

    # Append to GCS output
    new_lines = [json.dumps(rec) for rec in embedding_records]
    print(f"\nAppending to {GCS_OUTPUT_PATH} ...")
    append_lines_to_gcs(new_lines, GCS_OUTPUT_PATH)

    # Update state
    if force:
        save_embedded_ids(doc_ids_in_batch)
    else:
        save_embedded_ids(embedded_ids | doc_ids_in_batch)

    total_embedded = len(embedded_ids | doc_ids_in_batch)
    print(f"\nDone. {len(embedding_records)} new embeddings saved to:")
    print(f"  {GCS_OUTPUT_PATH}")
    print(f"  ({total_embedded} total doc(s) tracked in {STATE_FILE.name})")
    print()
    print("Next step (line 63): Create and deploy Vertex AI Vector Search Index")
    print(f"  Index input: {GCS_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
