# create-rag-service-account.ps1
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\create-rag-service-account.ps1 -ProjectId "aircare-sea"

param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$SaName = "hytel-rag-runtime",
  [string]$DisplayName = "Hytel RAG Runtime Service Account"
)

$ErrorActionPreference = "Stop"
$SaEmail = "$SaName@$ProjectId.iam.gserviceaccount.com"

Write-Host "Using project: $ProjectId"
gcloud config set project $ProjectId | Out-Null

# Enable required APIs
$apis = @(
  "iam.googleapis.com",
  "bigquery.googleapis.com",
  "aiplatform.googleapis.com",
  "firestore.googleapis.com",
  "secretmanager.googleapis.com",
  "storage.googleapis.com"
)
gcloud services enable $apis --project $ProjectId

# Create SA if missing
$exists = $false
try {
  gcloud iam service-accounts describe $SaEmail --project $ProjectId | Out-Null
  $exists = $true
} catch {
  $exists = $false
}

if (-not $exists) {
  gcloud iam service-accounts create $SaName `
    --display-name "$DisplayName" `
    --project $ProjectId
  Write-Host "Created service account: $SaEmail"
} else {
  Write-Host "Service account already exists: $SaEmail"
}

# Project-level roles for your RAG backend
$roles = @(
  "roles/bigquery.jobUser",
  "roles/bigquery.dataViewer",
  "roles/aiplatform.user",
  "roles/datastore.user",
  "roles/secretmanager.secretAccessor",
  "roles/storage.objectViewer"
)

foreach ($role in $roles) {
  gcloud projects add-iam-policy-binding $ProjectId `
    --member "serviceAccount:$SaEmail" `
    --role $role | Out-Null
  Write-Host "Granted $role"
}

Write-Host ""
Write-Host "Done."
Write-Host "Service account: $SaEmail"
