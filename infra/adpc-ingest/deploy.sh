#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy the ADPC PM2.5 daily ingestion job to Cloud Run + Cloud Scheduler
#
# Usage:
#   ./infra/adpc-ingest/deploy.sh
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - ADPC_TOKEN stored in Secret Manager (see Step 1 below)
#   - Artifact Registry repo exists (created automatically if not)
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
PROJECT="aircare-sea"
REGION="asia-southeast1"              # Singapore — closest to SEA data
REPO="cloud-run-jobs"                 # Artifact Registry repo name
IMAGE="adpc-ingest"

# Country-level job (action=get-data-pm25-dash)
JOB_COUNTRY="adpc-pm25-daily"
SCHEDULER_COUNTRY="adpc-pm25-trigger"

# Province-level timeseries job (action=get-city-pm25-timeseries)
JOB_PROVINCE="adpc-province-timeseries-daily"
SCHEDULER_PROVINCE="adpc-province-timeseries-trigger"

SCHEDULE="0 8 * * *"                  # 08:00 UTC daily (~1 day after ADPC publishes)
SA_EMAIL="adpc-ingest@${PROJECT}.iam.gserviceaccount.com"
# ── End Config ──────────────────────────────────────────────────────────────

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${IMAGE}:latest"

echo "=== Step 1: Ensure ADPC_TOKEN is in Secret Manager ==="
echo "Run once if not already done:"
echo "  gcloud secrets create ADPC_TOKEN --project=${PROJECT}"
echo "  echo -n 'YOUR_TOKEN_HERE' | gcloud secrets versions add ADPC_TOKEN --data-file=- --project=${PROJECT}"
echo ""
read -p "Press Enter to continue (assuming secret already exists)..."

echo ""
echo "=== Step 2: Ensure Artifact Registry repo exists ==="
gcloud artifacts repositories describe "${REPO}" \
    --location="${REGION}" \
    --project="${PROJECT}" 2>/dev/null || \
gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --project="${PROJECT}"

echo ""
echo "=== Step 3: Build & push Docker image ==="
# Copy both scripts next to the Dockerfile for the build context
cp ../../scripts/ingest_adpc_pm25.py .
cp ../../scripts/ingest_adpc_province_timeseries.py .

gcloud builds submit . \
    --tag="${IMAGE_URI}" \
    --project="${PROJECT}"

# Clean up copied scripts
rm -f ingest_adpc_pm25.py ingest_adpc_province_timeseries.py

echo ""
echo "=== Step 4: Ensure service account exists ==="
gcloud iam service-accounts describe "${SA_EMAIL}" \
    --project="${PROJECT}" 2>/dev/null || \
gcloud iam service-accounts create adpc-ingest \
    --display-name="ADPC Ingest Job" \
    --project="${PROJECT}"

# Grant BigQuery write access
gcloud projects add-iam-policy-binding "${PROJECT}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/bigquery.dataEditor" \
    --condition=None

# Grant access to the ADPC_TOKEN secret
gcloud secrets add-iam-policy-binding ADPC_TOKEN \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT}"

echo ""
echo "=== Step 5a: Create / update Cloud Run Job — country level ==="
gcloud run jobs create "${JOB_COUNTRY}" \
    --image="${IMAGE_URI}" \
    --region="${REGION}" \
    --project="${PROJECT}" \
    --service-account="${SA_EMAIL}" \
    --set-secrets="ADPC_TOKEN=ADPC_TOKEN:latest" \
    --set-env-vars="BQ_PROJECT=${PROJECT},BQ_DATASET=aircare_sea,BQ_TABLE=adpc_pm25_regions" \
    --args="ingest_adpc_pm25.py" \
    --memory=512Mi \
    --cpu=1 \
    --max-retries=2 \
    --task-timeout=600 2>/dev/null || \
gcloud run jobs update "${JOB_COUNTRY}" \
    --image="${IMAGE_URI}" \
    --region="${REGION}" \
    --project="${PROJECT}" \
    --service-account="${SA_EMAIL}" \
    --set-secrets="ADPC_TOKEN=ADPC_TOKEN:latest" \
    --set-env-vars="BQ_PROJECT=${PROJECT},BQ_DATASET=aircare_sea,BQ_TABLE=adpc_pm25_regions" \
    --args="ingest_adpc_pm25.py" \
    --memory=512Mi \
    --cpu=1 \
    --max-retries=2 \
    --task-timeout=600

echo ""
echo "=== Step 5b: Create / update Cloud Run Job — province timeseries ==="
gcloud run jobs create "${JOB_PROVINCE}" \
    --image="${IMAGE_URI}" \
    --region="${REGION}" \
    --project="${PROJECT}" \
    --service-account="${SA_EMAIL}" \
    --set-secrets="ADPC_TOKEN=ADPC_TOKEN:latest" \
    --set-env-vars="BQ_PROJECT=${PROJECT},BQ_DATASET=aircare_sea,BQ_TABLE=adpc_pm25_province_timeseries" \
    --args="ingest_adpc_province_timeseries.py" \
    --memory=512Mi \
    --cpu=1 \
    --max-retries=2 \
    --task-timeout=600 2>/dev/null || \
gcloud run jobs update "${JOB_PROVINCE}" \
    --image="${IMAGE_URI}" \
    --region="${REGION}" \
    --project="${PROJECT}" \
    --service-account="${SA_EMAIL}" \
    --set-secrets="ADPC_TOKEN=ADPC_TOKEN:latest" \
    --set-env-vars="BQ_PROJECT=${PROJECT},BQ_DATASET=aircare_sea,BQ_TABLE=adpc_pm25_province_timeseries" \
    --args="ingest_adpc_province_timeseries.py" \
    --memory=512Mi \
    --cpu=1 \
    --max-retries=2 \
    --task-timeout=600

echo ""
echo "=== Step 6: Create / update Cloud Scheduler jobs ==="
# Scheduler needs permission to invoke Cloud Run Jobs
SCHEDULER_SA="service-$(gcloud projects describe ${PROJECT} --format='value(projectNumber)')@gcp-sa-cloudscheduler.iam.gserviceaccount.com"

# 6a — country level
gcloud scheduler jobs create http "${SCHEDULER_COUNTRY}" \
    --location="${REGION}" \
    --project="${PROJECT}" \
    --schedule="${SCHEDULE}" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB_COUNTRY}:run" \
    --message-body="{}" \
    --oauth-service-account-email="${SCHEDULER_SA}" \
    --time-zone="UTC" \
    --description="Daily ADPC SERVIR PM2.5 country-level ingest" 2>/dev/null || \
gcloud scheduler jobs update http "${SCHEDULER_COUNTRY}" \
    --location="${REGION}" \
    --project="${PROJECT}" \
    --schedule="${SCHEDULE}" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB_COUNTRY}:run" \
    --message-body="{}" \
    --oauth-service-account-email="${SCHEDULER_SA}" \
    --time-zone="UTC"

# 6b — province timeseries
gcloud scheduler jobs create http "${SCHEDULER_PROVINCE}" \
    --location="${REGION}" \
    --project="${PROJECT}" \
    --schedule="${SCHEDULE}" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB_PROVINCE}:run" \
    --message-body="{}" \
    --oauth-service-account-email="${SCHEDULER_SA}" \
    --time-zone="UTC" \
    --description="Daily ADPC SERVIR PM2.5 province timeseries ingest" 2>/dev/null || \
gcloud scheduler jobs update http "${SCHEDULER_PROVINCE}" \
    --location="${REGION}" \
    --project="${PROJECT}" \
    --schedule="${SCHEDULE}" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB_PROVINCE}:run" \
    --message-body="{}" \
    --oauth-service-account-email="${SCHEDULER_SA}" \
    --time-zone="UTC"

echo ""
echo "=== Done! ==="
echo ""
echo "Both jobs run daily at 08:00 UTC (schedule: '${SCHEDULE}')"
echo ""
echo "Useful commands:"
echo ""
echo "  # Trigger manually:"
echo "  gcloud run jobs execute ${JOB_COUNTRY}  --region=${REGION} --project=${PROJECT}"
echo "  gcloud run jobs execute ${JOB_PROVINCE} --region=${REGION} --project=${PROJECT}"
echo ""
echo "  # Watch logs:"
echo "  gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=${JOB_COUNTRY}'  --project=${PROJECT} --limit=50 --format='table(timestamp,textPayload)'"
echo "  gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=${JOB_PROVINCE}' --project=${PROJECT} --limit=50 --format='table(timestamp,textPayload)'"
echo ""
echo "  # Check schedulers:"
echo "  gcloud scheduler jobs list --location=${REGION} --project=${PROJECT}"
