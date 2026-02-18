# AirCare SEA – Phase 1: GCP Setup & Infrastructure

**Sprint Days 1–2 | Owner: Member 1 (with Member 2 for initial GCP setup)**

---

## Overview

Phase 1 establishes the GCP project, enables required APIs, creates storage resources, configures IAM, and validates the OpenAQ API connection. By end of Day 2, raw AQI data should be flowing into GCS.

---

## Step 1: GCP Project Initialization

### 1.1 Create & Configure Project

```bash
# Create the project (if not already created via Console)
gcloud projects create aircare-sea --name="AirCare SEA"

# Set as active project
gcloud config set project aircare-sea

# Link billing account (get your billing account ID first)
gcloud billing accounts list
gcloud billing projects link aircare-sea --billing-account=XXXXXX-XXXXXX-XXXXXX

# Set default region/zone
gcloud config set compute/region asia-southeast1 // us-central1
gcloud config set compute/zone asia-southeast1
```

### 1.2 Enable Required APIs

```bash
gcloud services enable   aiplatform.googleapis.com   bigquery.googleapis.com   storage.googleapis.com   run.googleapis.com
gcloud services enable  secretmanager.googleapis.com   cloudbuild.googleapis.com   logging.googleapis.com   monitoring.googleapis.com artifactregistry.googleapis.com
```

> ⏱ API enablement takes ~2–3 minutes. Verify with:
>
> ```bash
> gcloud services list --enabled | grep -E "aiplatform|bigquery|storage|run"
> ```

---

## Step 2: IAM & Service Accounts

### 2.1 Create Service Accounts

```bash
# Backend API service account
gcloud iam service-accounts create aircare-backend   --display-name="AirCare Backend API"

# Data pipeline service account
gcloud iam service-accounts create aircare-pipeline  --display-name="AirCare Data Pipeline"
```

### 2.2 Grant Required Roles

```bash
PROJECT_ID="aircare-sea"

# Backend: needs BigQuery read, Vertex AI, Secret Manager
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:aircare-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:aircare-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:aircare-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:aircare-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Pipeline: needs BigQuery write, GCS write, Vertex AI
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:aircare-pipeline@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:aircare-pipeline@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:aircare-pipeline@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

---

## Step 3: Cloud Storage Setup

### 3.1 Create GCS Bucket

```bash
# Create bucket with uniform bucket-level access
gsutil mb -l us-central1 -b on gs://aircare-sea-data

# Create folder structure
gsutil cp /dev/null gs://aircare-sea-data/raw/.keep
gsutil cp /dev/null gs://aircare-sea-data/processed/.keep
gsutil cp /dev/null gs://aircare-sea-data/models/.keep
gsutil cp /dev/null gs://aircare-sea-data/docs/.keep
gsutil cp /dev/null gs://aircare-sea-data/logs/.keep
gsutil cp /dev/null gs://aircare-sea-data/cache/.keep
```

### 3.2 Set Lifecycle Policy (cost control)

Create `lifecycle.json`:

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 90,
          "matchesPrefix": ["raw/", "logs/", "cache/"]
        }
      }
    ]
  }
}
```

```bash
gsutil lifecycle set lifecycle.json gs://aircare-sea-data
```

---

## Step 4: BigQuery Setup

### 4.1 Create Dataset

```bash
bq mk \
  --location=$REGION \
  --dataset \
  --description="AirCare SEA time series AQI data" \
  aircare-sea:aircare_sea
```

### 4.2 Create Tables

```bash
# Create schema files first (bq mk --schema is most reliable with a JSON file)
cat > aqi_measurements_schema.json << 'EOF'
[
  {"name":"measurement_id","type":"STRING","mode":"REQUIRED"},
  {"name":"city","type":"STRING","mode":"REQUIRED"},
  {"name":"country","type":"STRING","mode":"REQUIRED"},
  {"name":"latitude","type":"FLOAT","mode":"REQUIRED"},
  {"name":"longitude","type":"FLOAT","mode":"REQUIRED"},
  {"name":"timestamp","type":"TIMESTAMP","mode":"REQUIRED"},
  {"name":"pm25","type":"FLOAT","mode":"NULLABLE"},
  {"name":"pm10","type":"FLOAT","mode":"NULLABLE"},
  {"name":"no2","type":"FLOAT","mode":"NULLABLE"},
  {"name":"o3","type":"FLOAT","mode":"NULLABLE"},
  {"name":"co","type":"FLOAT","mode":"NULLABLE"},
  {"name":"aqi_value","type":"INTEGER","mode":"NULLABLE"},
  {"name":"aqi_category","type":"STRING","mode":"NULLABLE"},
  {"name":"source","type":"STRING","mode":"NULLABLE"},
  {"name":"ingestion_time","type":"TIMESTAMP","mode":"NULLABLE"}
]
EOF

cat > forecast_outputs_schema.json << 'EOF'
[
  {"name":"forecast_id","type":"STRING","mode":"REQUIRED"},
  {"name":"city","type":"STRING","mode":"REQUIRED"},
  {"name":"forecast_timestamp","type":"TIMESTAMP","mode":"REQUIRED"},
  {"name":"predicted_timestamp","type":"TIMESTAMP","mode":"REQUIRED"},
  {"name":"predicted_pm25","type":"FLOAT","mode":"NULLABLE"},
  {"name":"confidence_lower","type":"FLOAT","mode":"NULLABLE"},
  {"name":"confidence_upper","type":"FLOAT","mode":"NULLABLE"},
  {"name":"model_version","type":"STRING","mode":"NULLABLE"},
  {"name":"created_at","type":"TIMESTAMP","mode":"NULLABLE"}
]
EOF

# Create aqi_measurements table
bq mk \
  --table \
  --schema=aqi_measurements_schema.json \
  --time_partitioning_field=timestamp \
  --time_partitioning_type=DAY \
  --clustering_fields=city,country \
  aircare-sea:aircare_sea.aqi_measurements

# Create forecast_outputs table
bq mk \
  --table \
  --schema=forecast_outputs_schema.json \
  --time_partitioning_field=forecast_timestamp \
  --time_partitioning_type=DAY \
  --clustering_fields=city \
  aircare-sea:aircare_sea.forecast_outputs
```

### 4.3 Verify Tables

```bash
bq ls aircare-sea:aircare_sea
bq show aircare-sea:aircare_sea.aqi_measurements
```

---

## Step 5: Secret Manager

### 5.1 Store API Keys

OPENAQ_API_KEY="fa2b63681e9f2eecf9bd04a97484be9be6bc5fc9c22c1a6faccc8303a90a6f1b"

```bash
# OpenAQ API key
echo -n "YOUR_OPENAQ_API_KEY" | \
  gcloud secrets create $OPENAQ_API_KEY \
    --data-file=- \
    --replication-policy="automatic"

# Add a new version if you need to rotate:
# echo -n "NEW_KEY" | gcloud secrets versions add openaq-api-key --data-file=-
```

### 5.2 Verify Secret Access

```bash
gcloud secrets versions access latest --secret="OPENAQ_API_KEY"
```

---

## Step 6: OpenAQ API Validation

### 6.1 Get OpenAQ API Key

Sign up at [https://explore.openaq.org](https://explore.openaq.org) → API Keys → Create key.

### 6.2 Test the API (curl)

```bash
# NOTE: OpenAQ v1/v2 endpoints were retired on 2025-01-31.
# Use v3 endpoints only.

# 1) Find a Manila location ID
curl -s -X GET \
  "https://api.openaq.org/v3/locations?city=Manila&limit=1" \
  -H "X-API-Key: $OPENAQ_API_KEY" \
  | python3 -m json.tool

# 2) Replace LOCATION_ID with results[0].id from the response above,
#    then fetch latest measurements for that location
curl -s -X GET \
  "https://api.openaq.org/v3/locations/8118/latest?limit=5" \
  -H "X-API-Key:  $OPENAQ_API_KEY" \
  | python3 -m json.tool
```

Expected: JSON with a `results` array containing latest pollutant measurements (for example PM2.5, PM10, NO2 where available) plus `datetime`, `coordinates`, and sensor/location IDs.

### 6.3 Test Target Cities

Run this to validate coverage for all target cities:

```bash
#!/bin/bash
# scripts/validate_openaq_cities.sh

CITIES=("Manila" "Jakarta" "Bangkok" "Ho+Chi+Minh+City" "Kuala+Lumpur")

for city in "${CITIES[@]}"; do
  echo -n "Testing $city... "
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://api.openaq.org/v3/locations?city=${city}&limit=1" \
    -H "X-API-Key: $OPENAQ_API_KEY")

  if [ "$response" = "200" ]; then
    echo "✓ OK"
  else
    echo "✗ FAILED (HTTP $response)"
  fi
done
```

---

## Step 7: Repository Setup

### 7.1 Initialize Repository

```bash
mkdir aircare-sea && cd aircare-sea
git init

# Create .gitignore
cat > .gitignore << 'EOF'
keys/
*.json.key
__pycache__/
*.pyc
.env
.env.*
venv/
.venv/
*.egg-info/
dist/
build/
.DS_Store
EOF

git add .gitignore
git commit -m "Initial commit: gitignore"
```

### 7.2 Create Folder Structure

```bash
mkdir -p backend/{routes,services,models,utils,tests}
mkdir -p frontend/{components,services,utils}
mkdir -p data-pipeline/{ingestion,preprocessing,forecasting}
mkdir -p terraform
mkdir -p docs
mkdir -p scripts
mkdir -p keys  # gitignored

touch backend/app.py
touch backend/requirements.txt
touch backend/Dockerfile
touch frontend/app.py
touch frontend/requirements.txt
touch frontend/Dockerfile
touch README.md

git add .
git commit -m "feat: scaffold project structure"
```

### 7.3 Create Feature Branches

```bash
git checkout -b feature/backend-api    # Member 1
git push -u origin feature/backend-api

git checkout main
git checkout -b feature/rag-pipeline   # Member 2
git push -u origin feature/rag-pipeline
```

---

## Step 8: Set Budget Alert

```bash
# Via Console: Billing → Budgets & Alerts → Create Budget
# Set alert at $25 (warn) and $50 (hard limit notify)
# Or via CLI:
gcloud billing budgets create \
  --billing-account=XXXXXX-XXXXXX-XXXXXX \
  --display-name="AirCare SEA Budget" \
  --budget-amount=50USD \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90
```

---

## Phase 1 Completion Checklist

| Task                                        | Owner    | Status |
| ------------------------------------------- | -------- | ------ |
| GCP project created & billing linked        | Both     | ☐      |
| All APIs enabled                            | Member 1 | ☐      |
| Service accounts created with correct roles | Member 1 | ☐      |
| GCS bucket created with folder structure    | Member 1 | ☐      |
| BigQuery dataset and tables created         | Member 1 | ☐      |
| OpenAQ API key stored in Secret Manager     | Member 1 | ☐      |
| OpenAQ validated for all 5 target cities    | Member 1 | ☐      |
| Git repo initialized with correct structure | Both     | ☐      |
| Feature branches created                    | Both     | ☐      |
| Budget alert set at $50                     | Both     | ☐      |
| Keys added to `.gitignore` (verify!)        | Both     | ☐      |

---

## Next: Phase 2 (Days 3–4)

Once Phase 1 is complete, Member 1 proceeds to build `openaq_fetcher.py` and load historical data into BigQuery. Member 2 begins health document collection and the chunking pipeline.
