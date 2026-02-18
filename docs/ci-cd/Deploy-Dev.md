# Development Deployment Workflow

> This document explains the development deployment workflow.
> The actual workflow file is located at `.github/workflows/deploy-dev.yml`.

**Prerequisites**: Read [CI-CD-Pipeline-Guide.md](CI-CD-Pipeline-Guide.md) and [CI.md](CI.md) first.

**Next**: [Deploy-Stage.md](Deploy-Stage.md) - Staging deployment workflow

---

## Overview

The development deployment workflow runs when code is **pushed to the `dev` branch**. It:

1. Authenticates with GCP using Workload Identity Federation
2. Builds the application for production
3. Deploys to Firebase Hosting and Functions

---

## Trigger

The workflow triggers automatically on:

- **Push to `dev` branch** - Includes direct pushes and merged PRs
- **Manual trigger** - Via GitHub Actions UI (workflow_dispatch)

---

## The Workflow

The actual workflow is in `.github/workflows/deploy-dev.yml`. Here's how it works:

### Step-by-Step Flow

```
1. Checkout Code
   └── Clone the repository

2. Setup Environment
   ├── Install pnpm (v8)
   └── Install Node.js (v20)

3. Install Dependencies
   └── pnpm install --frozen-lockfile

4. Build Application
   └── pnpm build (with VITE_API_URL set)

5. Authenticate with GCP (WIF)
   ├── Request OIDC token from GitHub
   ├── Exchange for GCP temporary credentials
   └── No long-lived keys needed!

6. Deploy to Firebase
   ├── Deploy Hosting (static files)
   └── Deploy Functions (serverless backend)

7. Summary
   └── Post deployment details to workflow summary
```

---

## Workload Identity Federation

The workflow uses **secrets** for WIF configuration:

```yaml
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ secrets.GCP_SA_EMAIL }}
```

### Required Secrets

Configure these in GitHub repository settings:

| Secret                           | Description            | Example                                                                                                        |
| -------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full WIF provider path | `projects/123456/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider` |
| `GCP_SA_EMAIL`                   | Service account email  | `github-actions-sa@my-project.iam.gserviceaccount.com`                                                         |

### Why WIF?

| Traditional Approach                | WIF Approach                 |
| ----------------------------------- | ---------------------------- |
| Store service account key as secret | No stored credentials        |
| Keys can be leaked or stolen        | Tokens expire in ~1 hour     |
| Manual key rotation required        | Automatic credential refresh |
| Hard to audit usage                 | Full audit trail in GCP      |

---

## Environment Configuration

The workflow uses the GitHub Environment `dev`:

```yaml
environment:
  name: dev
  url: https://dev.example.com
```

### Setting Up the Environment

1. Go to **Repository Settings** → **Environments**
2. Click **New environment**
3. Name it `dev`
4. (Optional) Add environment-specific secrets

---

## Customization

### Changing the API URL

Update the `VITE_API_URL` environment variable in the build step:

```yaml
- name: Build
  run: pnpm build
  env:
    VITE_API_URL: https://dev-api.example.com
```

### Adding Notifications

Add a step after deployment for Slack/Discord notifications:

```yaml
- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {"text": "Deployed to dev: ${{ github.sha }}"}
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## Troubleshooting

### "Unable to detect Application Default Credentials"

**Cause**: WIF authentication failed.

**Fix**: Verify:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` secret is set correctly
- `GCP_SA_EMAIL` secret matches your service account
- WIF was set up correctly with `scripts/setup-wif.sh`

### "Permission denied on Firebase"

**Cause**: Service account missing Firebase permissions.

**Fix**: Grant `roles/firebase.admin` to the service account:

```bash
gcloud projects add-iam-policy-binding YOUR-PROJECT-ID \
  --member="serviceAccount:YOUR-SA-EMAIL" \
  --role="roles/firebase.admin"
```

### "Build failed"

**Cause**: Build errors in the code.

**Fix**:

1. Run `pnpm build` locally to verify
2. Check the build logs for specific errors
3. Ensure all dependencies are committed to `pnpm-lock.yaml`

---

## Related Files

- [CI-CD-Pipeline-Guide.md](CI-CD-Pipeline-Guide.md) - Overview and concepts
- [CI.md](CI.md) - Continuous Integration workflow
- [Deploy-Stage.md](Deploy-Stage.md) - Staging deployment workflow
- [Deploy-Main.md](Deploy-Main.md) - Production deployment workflow
- [setup-wif.sh](../../scripts/setup-wif.sh) - WIF setup script
