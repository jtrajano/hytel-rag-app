### Firestore document structure per chunk:

rag_chunks/{chunk_id}
├── id: "who-aqg-2021_chunk_000"
├── content: "PM2.5 concentrations above..." ← returned in RAG response
├── embedding: Vector([0.021, -0.043, ...]) ← used by findNearest()
├── doc_id: "who-aqg-2021-factsheet"
├── source_label: "WHO Air Quality Guidelines..."
├── source_url: "https://..."
├── chunk_index: 0
└── total_chunks: 12

```
pnpm fetch:docs    # → GCS raw docs
pnpm chunk:docs    # → GCS chunks.jsonl
pnpm embed:docs    # → GCS embeddings.jsonl
pnpm index:docs    # → Firestore rag_chunks collection
```

### Before querying — create the vector index once:

```
gcloud firestore indexes composite create \
  --project=aircare-sea \
  --collection-group=rag_chunks \
  --query-scope=COLLECTION \
  --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}'
```

```
gcloud firestore indexes composite list --project=aircare-sea

```

### Clean borderline or off topic chunks

```
FIRESTORE_PROJECT=aircare-sea python scripts/cleanup_firestore.py
```
