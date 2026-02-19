"""
AirCare SEA — RAG Chat API
FastAPI service wrapping Vertex AI text-embedding-004 + Firestore vector search + Gemini Flash.

Start:
  VERTEX_PROJECT=aircare-sea uvicorn backend.app:app --reload --port 8000
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Env config ────────────────────────────────────────────────────────────────

VERTEX_PROJECT = os.environ.get("VERTEX_PROJECT", "aircare-sea")
VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", VERTEX_PROJECT)
COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "rag_chunks")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-001")

TOP_K = 5
DISTANCE_THRESHOLD = 0.4  # cosine; 0=identical, 1=unrelated

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Lazy singletons (populated in lifespan) ───────────────────────────────────

_embed_model = None
_gen_model = None
_db = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise GCP clients once at startup."""
    global _embed_model, _gen_model, _db

    import vertexai
    from vertexai.language_models import TextEmbeddingModel
    from vertexai.generative_models import GenerativeModel
    from google.cloud import firestore

    logger.info("Initialising Vertex AI (project=%s, location=%s)…", VERTEX_PROJECT, VERTEX_LOCATION)
    vertexai.init(project=VERTEX_PROJECT, location=VERTEX_LOCATION)
    _embed_model = TextEmbeddingModel.from_pretrained("text-embedding-004")
    _gen_model = GenerativeModel(GEMINI_MODEL)

    logger.info("Connecting to Firestore (project=%s)…", FIRESTORE_PROJECT)
    _db = firestore.Client(project=FIRESTORE_PROJECT)

    logger.info("RAG service ready.")
    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="AirCare SEA RAG API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:5001",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schemas ───────────────────────────────────────────────────────────────────


class ChatRequest(BaseModel):
    question: str
    health_profile: str | None = None


class Source(BaseModel):
    label: str
    url: str | None = None
    chunk_index: int | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]


# ── Helpers ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are AirCare SEA, an expert AI assistant for Southeast Asian air quality and public health.

Answer the user's question based ONLY on the provided context excerpts.
- Cite source labels naturally in-line (e.g. "According to WHO Guidelines 2021, …").
- Be concise and actionable — no more than 3 short paragraphs.
- If the context does not contain enough information, say so honestly and provide brief general safety guidance.
- Do NOT invent data, statistics, or citations.
"""


def _embed(question: str) -> list[float]:
    results = _embed_model.get_embeddings([question])
    return results[0].values


def _retrieve(query_vector: list[float]) -> list[dict]:
    from google.cloud.firestore_v1.vector import Vector
    from google.cloud.firestore_v1.base_vector_query import DistanceMeasure

    results = (
        _db.collection(COLLECTION)
        .find_nearest(
            vector_field="embedding",
            query_vector=Vector(query_vector),
            distance_measure=DistanceMeasure.COSINE,
            limit=TOP_K,
            distance_result_field="vector_distance",
        )
        .get()
    )
    return [doc.to_dict() for doc in results]


def _build_prompt(question: str, docs: list[dict], health_profile: str | None) -> str:
    context_parts = []
    for doc in docs:
        label = doc.get("source_label", "Unknown Source")
        content = doc.get("content", "").strip()
        context_parts.append(f"[{label}]\n{content}")

    context = "\n\n---\n\n".join(context_parts)

    health_note = (
        f"\nThe user has the following health profile: {health_profile}."
        " Tailor your advice accordingly."
        if health_profile
        else ""
    )

    return (
        f"{SYSTEM_PROMPT}"
        f"{health_note}\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question}\n\n"
        f"Answer:"
    )


def _deduplicate_sources(docs: list[dict]) -> list[Source]:
    seen: set[str] = set()
    sources: list[Source] = []
    for doc in docs:
        label = doc.get("source_label", "Unknown Source")
        if label not in seen:
            sources.append(
                Source(
                    label=label,
                    url=doc.get("source_url"),
                    chunk_index=doc.get("chunk_index"),
                )
            )
            seen.add(label)
    return sources


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok", "model": GEMINI_MODEL}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="question must not be empty")

    logger.info("Chat request: %r (profile=%s)", request.question[:80], request.health_profile)

    # 1. Embed
    query_vector = _embed(request.question)

    # 2. Retrieve
    docs = _retrieve(query_vector)

    # 3. Filter by relevance; fallback to top-3
    relevant = [d for d in docs if d.get("vector_distance", 1.0) <= DISTANCE_THRESHOLD]
    if not relevant:
        logger.info("No chunks below threshold %.2f — using top-3 fallback", DISTANCE_THRESHOLD)
        relevant = docs[:3]

    if not relevant:
        return ChatResponse(
            answer=(
                "I don't have enough information in my knowledge base to answer that question. "
                "For air quality concerns, please check your local AQI and consult a healthcare professional."
            ),
            sources=[],
        )

    # 4. Generate answer
    prompt = _build_prompt(request.question, relevant, request.health_profile)
    response = _gen_model.generate_content(prompt)
    answer = response.text.strip()

    # 5. Build sources
    sources = _deduplicate_sources(relevant)

    logger.info("Answered with %d source(s)", len(sources))
    return ChatResponse(answer=answer, sources=sources)
