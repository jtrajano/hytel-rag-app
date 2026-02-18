#!/usr/bin/env python3
"""
Chunk cleaned documents into overlapping text segments for RAG embeddings.

Reads .txt files from gs://{GCS_BUCKET}/docs/clean/ (or LOCAL_DOCS_DIR),
chunks each with RecursiveCharacterTextSplitter (512 tokens / 100 overlap),
and appends new chunks to gs://{GCS_BUCKET}/processed/chunks/chunks.jsonl.

Already-chunked documents are tracked in scripts/docs-chunked.json and
skipped on subsequent runs (incremental). Use --force to re-chunk everything.

Usage:
  GCS_BUCKET=aircare-sea-data python scripts/chunk_documents.py
  GCS_BUCKET=aircare-sea-data python scripts/chunk_documents.py --force

Env vars:
  GCS_BUCKET      - GCS bucket name          (default: aircare-sea-data)
  LOCAL_DOCS_DIR  - Read .txt files from a local directory instead of GCS
  GCS_OUTPUT_PATH - Full GCS URI for output  (default: gs://{BUCKET}/processed/chunks/chunks.jsonl)

Requirements:
  pip install langchain-text-splitters
"""

import json
import os
import platform
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

_SHELL = platform.system() == "Windows"

BUCKET = os.environ.get("GCS_BUCKET", "aircare-sea-data")
LOCAL_DOCS_DIR = os.environ.get("LOCAL_DOCS_DIR")
GCS_CLEAN_PREFIX = "docs/clean"
GCS_OUTPUT_PATH = os.environ.get(
    "GCS_OUTPUT_PATH",
    f"gs://{BUCKET}/processed/chunks/chunks.jsonl",
)

SOURCES_FILE = Path(__file__).parent / "docs-sources.json"
STATE_FILE = Path(__file__).parent / "docs-chunked.json"

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    print("Missing dependency. Run: pip install langchain-text-splitters")
    sys.exit(1)


# ---------------------------------------------------------------------------
# DocumentChunker (TDD 5.2)
# ---------------------------------------------------------------------------

class DocumentChunker:
    def __init__(self, chunk_size: int = 512, chunk_overlap: int = 100):
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=self._token_length,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def chunk_document(self, text: str, metadata: dict) -> list[dict]:
        chunks = self.splitter.split_text(text)
        result = []
        for i, chunk in enumerate(chunks):
            result.append({
                "id": f"{metadata['doc_id']}_chunk_{i:03d}",
                "content": chunk,
                "metadata": {
                    **metadata,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            })
        return result

    @staticmethod
    def _token_length(text: str) -> int:
        # Approximation: 1 token ≈ 4 characters
        return len(text) // 4


# ---------------------------------------------------------------------------
# State tracking (mirrors docs-extracted.json pattern)
# ---------------------------------------------------------------------------

def load_chunked_ids() -> set[str]:
    """Return the set of doc IDs already chunked."""
    if not STATE_FILE.exists():
        return set()
    data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return set(data.get("chunkedIds", []))


def save_chunked_ids(ids: set[str]) -> None:
    existing = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    existing["chunkedIds"] = sorted(ids)
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


def list_gcs_txt_files(bucket: str, prefix: str) -> list[str]:
    try:
        output = run_gsutil("ls", "-r", f"gs://{bucket}/{prefix}/")
    except RuntimeError:
        return []
    return [line.strip() for line in output.splitlines() if line.strip().endswith(".txt")]


def download_gcs_file(gcs_uri: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        run_gsutil("cp", gcs_uri, tmp_path)
        return Path(tmp_path).read_text(encoding="utf-8")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def append_chunks_to_gcs(new_chunks: list[dict], gcs_uri: str) -> None:
    """
    Append new_chunks to the existing JSONL at gcs_uri (creates if absent).
    Downloads the existing file, appends, then re-uploads.
    """
    existing_lines: list[str] = []

    if gcs_file_exists(gcs_uri):
        print(f"  Downloading existing {gcs_uri} for append...")
        existing_content = download_gcs_file(gcs_uri)
        existing_lines = [ln for ln in existing_content.splitlines() if ln.strip()]

    new_lines = [json.dumps(chunk, ensure_ascii=False) for chunk in new_chunks]
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
# Main
# ---------------------------------------------------------------------------

def load_sources(path: Path) -> dict:
    sources = json.loads(path.read_text(encoding="utf-8"))
    return {s["id"]: {"label": s.get("label", ""), "url": s.get("url", "")} for s in sources}


def main() -> None:
    force = "--force" in sys.argv

    print(f"Bucket     : {BUCKET}")
    print(f"Input      : {LOCAL_DOCS_DIR or f'gs://{BUCKET}/{GCS_CLEAN_PREFIX}/'}")
    print(f"Output     : {GCS_OUTPUT_PATH}")
    print(f"Mode       : {'force (re-chunk all)' if force else 'incremental (skip already chunked)'}")
    print()

    sources = load_sources(SOURCES_FILE)
    chunked_ids = set() if force else load_chunked_ids()

    if chunked_ids:
        print(f"Already chunked: {len(chunked_ids)} doc(s) — will skip these")
        print()

    # Collect (doc_id, text) pairs
    docs: list[tuple[str, str]] = []

    if LOCAL_DOCS_DIR:
        txt_files = sorted(Path(LOCAL_DOCS_DIR).glob("*.txt"))
        for txt_file in txt_files:
            doc_id = txt_file.stem
            if doc_id in chunked_ids:
                continue
            text = txt_file.read_text(encoding="utf-8")
            docs.append((doc_id, text))
        print(f"Found {len(docs)} new .txt file(s) locally")
    else:
        gcs_uris = list_gcs_txt_files(BUCKET, GCS_CLEAN_PREFIX)
        new_uris = [u for u in gcs_uris if Path(u).stem not in chunked_ids]
        skipped = len(gcs_uris) - len(new_uris)
        print(f"Found {len(gcs_uris)} .txt file(s) in GCS ({skipped} already chunked, {len(new_uris)} new)")
        for uri in new_uris:
            doc_id = Path(uri).stem
            print(f"  Downloading: {uri}")
            text = download_gcs_file(uri)
            docs.append((doc_id, text))

    if not docs:
        print("\nAll documents already chunked. Nothing to do.")
        print("Use --force to re-chunk everything.")
        return

    chunker = DocumentChunker()
    ingestion_date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"\nChunking {len(docs)} document(s)...")
    new_chunks: list[dict] = []

    for doc_id, text in docs:
        source_meta = sources.get(doc_id, {"label": doc_id, "url": ""})
        metadata = {
            "doc_id": doc_id,
            "source_label": source_meta["label"],
            "source_url": source_meta["url"],
            "ingestion_date": ingestion_date,
        }
        chunks = chunker.chunk_document(text, metadata)
        new_chunks.extend(chunks)
        print(f"  {doc_id}: {len(chunks)} chunks")

    print(f"\nNew chunks: {len(new_chunks)}")
    print(f"\nAppending to {GCS_OUTPUT_PATH} ...")
    append_chunks_to_gcs(new_chunks, GCS_OUTPUT_PATH)

    # Update state
    newly_done = {doc_id for doc_id, _ in docs}
    if force:
        save_chunked_ids(newly_done)
    else:
        save_chunked_ids(chunked_ids | newly_done)

    total_chunked = len(chunked_ids | newly_done)
    print(f"\nDone. {len(new_chunks)} new chunks saved to:")
    print(f"  {GCS_OUTPUT_PATH}")
    print(f"  ({total_chunked} total doc(s) tracked in {STATE_FILE.name})")
    print()
    print("Next step (line 62): Generate embeddings with text-embedding-004")


if __name__ == "__main__":
    main()
