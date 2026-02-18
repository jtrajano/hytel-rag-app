# Staging Deployment Workflow

> This document explains the staging deployment workflow.
> The actual workflow file is located at `.github/workflows/deploy-stage.yml`.

**Prerequisites**: Read [Deploy-Dev.md](Deploy-Dev.md) first.

**Previous**: [Deploy-Dev.md](Deploy-Dev.md) - Development deployment workflow

**Next**: [Deploy-Main.md](Deploy-Main.md) - Production deployment workflow

---

## Overview

The staging deployment workflow runs when code is **pushed to the `stage` branch**. It:

1. Authenticates with GCP using Workload Identity Federation
2. Builds the application for staging
3. Deploys to Firebase Hosting and Functions

---

## Trigger

The workflow triggers automatically on:

- **Push to `stage` branch** - Includes direct pushes and merged PRs from `dev`
- **Manual trigger** - Via GitHub Actions UI (workflow_dispatch)

---

## Stage vs Dev

| Aspect        | Dev              | Stage                   |
| ------------- | ---------------- | ----------------------- |
| **Branch**    | `dev`            | `stage`                 |
| **Purpose**   | Internal testing | QA & stakeholder review |
| **Stability** | May be unstable  | Should be stable        |
| **Data**      | Test data        | Production-like data    |
| **Access**    | Developers       | QA team, stakeholders   |

---

## Workflow Flow

```
Push to stage branch
        │
        ▼
┌───────────────────┐
│  Setup & Build    │
│  - Install deps   │
│  - Build app      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  WIF Auth         │
│  - Get OIDC token │
│  - Exchange creds │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Deploy Firebase  │
│  - Hosting        │
│  - Functions      │
└─────────┬─────────┘
          │
          ▼
    ✅ Complete
```

---

## Required Secrets

Same secrets as development (can point to same or different GCP project):

| Secret                           | Description           |
| -------------------------------- | --------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF provider path     |
| `GCP_SA_EMAIL`                   | Service account email |

### Using Different Projects per Environment

If you use separate GCP projects, you can:

1. Use environment-specific secrets (configured per environment)
2. Or use different secret names: `GCP_STAGE_SA_EMAIL`, etc.

---

## Environment Configuration

The workflow uses the GitHub Environment `stage`:

```yaml
environment:
  name: stage
  url: https://stage.example.com
```

### Setting Up the Environment

1. Go to **Repository Settings** → **Environments**
2. Click **New environment**
3. Name it `stage`
4. (Optional) Add **protection rules**:
   - Require approval before deployment
   - Limit to specific branches
   - Add wait timer

---

## The Workflow Code

The actual workflow is at `.github/workflows/deploy-stage.yml`:

```yaml
name: Deploy to Stage

on:
  push:
    branches:
      - stage
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    permissions:
      id-token: write # Required for WIF
      contents: read

    environment:
      name: stage
      url: https://stage.example.com

    steps:
      # ... setup steps ...

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SA_EMAIL }}

      - name: Deploy to Firebase
        run: |
          npm install -g firebase-tools
          firebase deploy --only hosting
```

---

## Promoting from Dev to Stage

To promote code from development to staging:

```bash
# Option 1: Merge dev into stage
git checkout stage
git merge dev
git push origin stage

# Option 2: Fast-forward (if linear history)
git checkout stage
git reset --hard dev
git push origin stage --force-with-lease
```

### Best Practice: Use PRs

1. Create a PR from `dev` to `stage`
2. Review changes
3. Merge PR (triggers deployment)

---

## QA Checklist

Before merging from dev to stage:

- [ ] All tests pass on dev
- [ ] Feature has been tested on dev environment
- [ ] No critical bugs reported
- [ ] Stakeholder approval (if required)

After deployment to stage:

- [ ] Smoke test critical flows
- [ ] Verify data integrity
- [ ] Check error monitoring
- [ ] Confirm with QA team

---

## Troubleshooting

### Same issues as dev deployment

See [Deploy-Dev.md#troubleshooting](Deploy-Dev.md#troubleshooting) for common issues.

### Stage-specific issues

**"Environment not found"**

- Create the `stage` environment in GitHub settings
- Ensure the environment name matches exactly

**"Approval required"**

- If you've set up required reviewers, get approval first
- Or disable the protection rule temporarily

---

## Related Files

- [Deploy-Dev.md](Deploy-Dev.md) - Development deployment workflow
- [Deploy-Main.md](Deploy-Main.md) - Production deployment workflow
- [CI-CD-Pipeline-Guide.md](CI-CD-Pipeline-Guide.md) - Overview and concepts
