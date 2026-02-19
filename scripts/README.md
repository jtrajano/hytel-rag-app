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

# Deploy ADPC PM2.5 daily ingestion job to Cloud Run + Cloud Scheduler

https://aq-tracker-servir.adpc.net/dashboard

Files created:

infra/adpc-ingest/Dockerfile — minimal Python image with only what the script needs
infra/adpc-ingest/deploy.sh — one-shot setup script
What the deploy script does (6 steps):

Step What
1 Stores ADPC_TOKEN in Secret Manager (not a plain env var)
2 Creates Artifact Registry repo for the Docker image
3 Builds & pushes image via Cloud Build
4 Creates a service account with BigQuery write + Secret access
5 Creates Cloud Run Job (adpc-pm25-daily)
6 Creates Cloud Scheduler trigger at 08:00 UTC daily
To deploy:

# First, store your token once:

gcloud secrets create ADPC_TOKEN --project=aircare-sea
echo -n 'your_token_here' | gcloud secrets versions add ADPC_TOKEN --data-file=- --project=aircare-sea

# Then run the deploy script:

cd infra/adpc-ingest
bash deploy.sh
To trigger manually (test run):

gcloud run jobs execute adpc-pm25-daily --region=asia-southeast1 --project=aircare-sea
The schedule 0 8 \* \* \* (08:00 UTC) gives ADPC ~32 hours after midnight to publish the previous day's model output before we fetch it.

### run back end api

```
cd apps/functions
pnpm run serve
```

pnpm --filter @repo/functions
pnpm --filter web dev
