#!/bin/bash
#
# ============================================================================
#                    EDUCATIONAL TEMPLATE ONLY
# ============================================================================
#
# This script is an EDUCATIONAL TEMPLATE for setting up Workload Identity
# Federation (WIF) between GitHub Actions and Google Cloud Platform.
#
# DO NOT RUN this script without:
#   1. A valid GCP project with billing enabled
#   2. Proper GCP credentials (gcloud auth login)
#   3. Understanding of what each command does
#   4. Replacing ALL placeholder values below
#
# WARNING: Running this script with invalid credentials or without proper
# setup may result in errors or unintended changes to your GCP project.
#
# ============================================================================
#
# EXERCISE: Try replacing placeholders with dummy values and running:
#   bash -n setup-wif.sh
# This will syntax-check the script without executing any commands.
#
# ============================================================================

set -euo pipefail

# ============================================================================
# CONFIGURATION - Replace these placeholders with your actual values
# ============================================================================

PROJECT_ID="<YOUR-GCP-PROJECT-ID>"
GITHUB_ORG="<YOUR-GITHUB-ORG>"
GITHUB_REPO="<YOUR-GITHUB-REPO>"

# Example (for reference only - do not use these values):
# PROJECT_ID="my-company-dev-123456"
# GITHUB_ORG="my-company"
# GITHUB_REPO="react-mono-repo-template"

# Derived values (usually don't need to change these)
SERVICE_ACCOUNT_NAME="github-actions-sa"
POOL_NAME="github-actions-pool"
PROVIDER_NAME="github-actions-provider"

# ============================================================================
# STEP 1: Enable Required APIs
# ============================================================================
# These APIs are needed for:
# - iamcredentials: Allows GitHub to request short-lived tokens
# - cloudresourcemanager: Manages GCP project resources
# - firebase: Firebase Hosting and Functions deployment
# - cloudfunctions: Cloud Functions deployment
# - cloudbuild: Building container images
# - artifactregistry: Storing container images

echo "Enabling required GCP APIs..."

gcloud services enable iamcredentials.googleapis.com \
    --project="${PROJECT_ID}"

gcloud services enable cloudresourcemanager.googleapis.com \
    --project="${PROJECT_ID}"

gcloud services enable firebase.googleapis.com \
    --project="${PROJECT_ID}"

gcloud services enable cloudfunctions.googleapis.com \
    --project="${PROJECT_ID}"

gcloud services enable cloudbuild.googleapis.com \
    --project="${PROJECT_ID}"

gcloud services enable artifactregistry.googleapis.com \
    --project="${PROJECT_ID}"

echo "APIs enabled successfully."

# ============================================================================
# STEP 2: Create Service Account
# ============================================================================
# This service account will be impersonated by GitHub Actions.
# It should have ONLY the permissions needed for deployment.
# Principle of least privilege: don't grant more than necessary.

echo "Creating service account..."

gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --project="${PROJECT_ID}" \
    --display-name="GitHub Actions Service Account" \
    --description="Service account for GitHub Actions CI/CD"

SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo "Service account created: ${SERVICE_ACCOUNT_EMAIL}"

# ============================================================================
# STEP 3: Grant Permissions to Service Account
# ============================================================================
# These roles allow the service account to:
# - roles/firebase.admin: Deploy to Firebase Hosting and manage Firebase
# - roles/cloudfunctions.developer: Deploy Cloud Functions
# - roles/artifactregistry.writer: Push container images
#
# IMPORTANT: Review these roles and remove any you don't need.
# Add additional roles if your deployment requires them.

echo "Granting permissions to service account..."

# Firebase Admin - for Hosting and Firestore
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/firebase.admin"

# Cloud Functions Developer - for deploying functions
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/cloudfunctions.developer"

# Artifact Registry Writer - for pushing container images
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/artifactregistry.writer"

# Service Account User - allows the SA to act as itself
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/iam.serviceAccountUser"

echo "Permissions granted successfully."

# ============================================================================
# STEP 4: Create Workload Identity Pool
# ============================================================================
# A Workload Identity Pool is a container for external identities.
# Think of it as a "trust boundary" - identities in this pool can
# request tokens for GCP resources.

echo "Creating Workload Identity Pool..."

gcloud iam workload-identity-pools create "${POOL_NAME}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --display-name="GitHub Actions Pool" \
    --description="Pool for GitHub Actions OIDC authentication"

echo "Workload Identity Pool created."

# ============================================================================
# STEP 5: Create OIDC Provider
# ============================================================================
# The OIDC provider configures how GitHub tokens are validated.
# - issuer-uri: GitHub's OIDC token issuer
# - attribute-mapping: Maps GitHub token claims to GCP attributes
# - attribute-condition: Restricts which repos can authenticate
#
# The attribute condition below limits access to your specific org/repo.
# This is CRITICAL for security - don't remove it!

echo "Creating OIDC Provider..."

gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_NAME}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_NAME}" \
    --display-name="GitHub Actions Provider" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository_owner == '${GITHUB_ORG}'"

echo "OIDC Provider created."

# ============================================================================
# STEP 6: Allow GitHub to Impersonate Service Account
# ============================================================================
# This binding allows the Workload Identity Pool to use the service account.
# The principalSet restricts which GitHub repos can impersonate.

echo "Binding service account to Workload Identity Pool..."

WORKLOAD_IDENTITY_POOL_ID="projects/${PROJECT_ID}/locations/global/workloadIdentityPools/${POOL_NAME}"

gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_EMAIL}" \
    --project="${PROJECT_ID}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}"

echo "Service account binding complete."

# ============================================================================
# STEP 7: Output Values for GitHub Actions
# ============================================================================
# After running this script, you'll need these values in your GitHub Actions
# workflow or as repository secrets.

echo ""
echo "============================================================================"
echo "SETUP COMPLETE - Save these values for GitHub Actions:"
echo "============================================================================"
echo ""
echo "WORKLOAD_IDENTITY_PROVIDER:"
echo "  projects/${PROJECT_ID}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"
echo ""
echo "SERVICE_ACCOUNT:"
echo "  ${SERVICE_ACCOUNT_EMAIL}"
echo ""
echo "Add these as GitHub repository secrets:"
echo "  - GCP_PROJECT_ID: ${PROJECT_ID}"
echo "  - GCP_SA_EMAIL: ${SERVICE_ACCOUNT_EMAIL}"
echo "  - GCP_WORKLOAD_IDENTITY_PROVIDER: (the provider string above)"
echo ""
echo "============================================================================"
echo "Next steps:"
echo "  1. Copy the values above to your GitHub repository secrets"
echo "  2. Update your workflow files with the correct project ID"
echo "  3. Test with a PR to verify authentication works"
echo "============================================================================"

