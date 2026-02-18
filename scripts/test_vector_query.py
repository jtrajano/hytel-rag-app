#!/usr/bin/env python3
"""
Quick smoke test for Firestore Native Vector Search.

Embeds a question with text-embedding-004, calls find_nearest() on the
rag_chunks collection, and prints the top matching chunks.

Prerequisites:
  1. pnpm embed:docs has been run
  2. pnpm index:docs has been run
  3. Firestore vector index exists (see below)

Create vector index (one-time, takes ~5 min):
  gcloud firestore indexes composite create \
    --project=aircare-sea \
    --collection-group=rag_chunks \
    --query-scope=COLLECTION \
    --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}'

Check index status:
  gcloud firestore indexes composite list --project=aircare-sea

Usage:
  VERTEX_PROJECT=aircare-sea python scripts/test_vector_query.py
  VERTEX_PROJECT=aircare-sea python scripts/test_vector_query.py "Can I jog outside?"
"""

import sys
import os

VERTEX_PROJECT = os.environ.get("VERTEX_PROJECT", "aircare-sea")
VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", VERTEX_PROJECT)
COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "rag_chunks")
TOP_K = 5
# Cosine distance threshold: 0.0 = identical, 1.0 = completely unrelated.
# Results with distance > this value are shown but flagged as low-relevance.
# The RAG service will use ~0.4 as a soft cutoff.
DISTANCE_THRESHOLD = 0.4

# Golden test questions (TDD validation set)
DEFAULT_QUESTIONS = [
    "Is it safe to exercise outdoors with high PM2.5?",
    "What AQI level is dangerous for asthma patients?",
    "Can I jog outside today?",
    "What are the health effects of PM2.5 exposure?",
    "How does air pollution affect children?",
]

try:
    import vertexai
    from vertexai.language_models import TextEmbeddingModel
except ImportError:
    print("Run: pip install google-cloud-aiplatform")
    sys.exit(1)

try:
    from google.cloud import firestore
    from google.cloud.firestore_v1.vector import Vector
    from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
except ImportError:
    print("Run: pip install 'google-cloud-firestore>=2.16.0'")
    sys.exit(1)


def embed_question(model: TextEmbeddingModel, question: str) -> list[float]:
    results = model.get_embeddings([question])
    return results[0].values


def query_firestore(
    db: firestore.Client,
    collection: str,
    query_vector: list[float],
    top_k: int,
) -> list[dict]:
    # distance_result_field stores the cosine distance on each returned doc
    results = (
        db.collection(collection)
        .find_nearest(
            vector_field="embedding",
            query_vector=Vector(query_vector),
            distance_measure=DistanceMeasure.COSINE,
            limit=top_k,
            distance_result_field="vector_distance",
        )
        .get()
    )
    return [doc.to_dict() for doc in results]


def print_results(question: str, docs: list[dict]) -> None:
    print(f"\nQ: {question}")
    print("-" * 60)
    if not docs:
        print("  No results returned.")
        return
    for i, doc in enumerate(docs, 1):
        distance = doc.get("vector_distance", None)
        similarity = f"{1 - distance:.2f}" if distance is not None else "?"
        dist_str = f"{distance:.4f}" if distance is not None else "?"
        low_relevance = distance is not None and distance > DISTANCE_THRESHOLD
        flag = "  ⚠ low relevance" if low_relevance else ""

        content = doc.get("content", "")
        truncated = len(content) > 180
        content_preview = content[:180].replace("\n", " ") + ("..." if truncated else "")
        print(f"  [{i}] {doc.get('source_label', 'Unknown')}{flag}")
        print(f"       similarity={similarity}  distance={dist_str}  "
              f"chunk {doc.get('chunk_index', '?')}/{doc.get('total_chunks', '?')} "
              f"— {doc.get('doc_id', '')}")
        print(f"       \"{content_preview}\"")
    print()


def main() -> None:
    questions = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_QUESTIONS

    print(f"Project    : {VERTEX_PROJECT}")
    print(f"Collection : {FIRESTORE_PROJECT}/{COLLECTION}")
    print(f"Top-K      : {TOP_K}")
    print()

    print("Initialising Vertex AI...")
    vertexai.init(project=VERTEX_PROJECT, location=VERTEX_LOCATION)
    model = TextEmbeddingModel.from_pretrained("text-embedding-004")

    print("Connecting to Firestore...")
    db = firestore.Client(project=FIRESTORE_PROJECT)
    print("Ready.\n")

    for question in questions:
        vector = embed_question(model, question)
        docs = query_firestore(db, COLLECTION, vector, TOP_K)
        print_results(question, docs)


if __name__ == "__main__":
    main()
