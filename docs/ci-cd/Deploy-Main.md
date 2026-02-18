# Production Deployment Workflow

> This document explains the production deployment workflow.
> The actual workflow file is located at `.github/workflows/deploy-main.yml`.

**Prerequisites**: Read [Deploy-Stage.md](Deploy-Stage.md) first.

**Previous**: [Deploy-Stage.md](Deploy-Stage.md) - Staging deployment workflow

---

## Overview

The production deployment workflow runs **only when manually triggered** from the `main` branch. It:

1. **Requires confirmation** - You must type "production" to confirm
2. Optionally runs tests before deployment
3. Authenticates with GCP using Workload Identity Federation
4. Builds and deploys to Firebase

---

## ⚠️ Important: Manual Only

Unlike dev and stage, production deployments are **never automatic**. This prevents accidental deployments from:

- Unintended pushes
- Automatic merges
- CI failures that bypass checks

---

## Trigger

The workflow **only** triggers via:

- **Manual trigger** - Via GitHub Actions UI (workflow_dispatch)

### Required Inputs

When triggering manually, you must provide:

| Input                | Required | Description                               |
| -------------------- | -------- | ----------------------------------------- |
| `confirm_production` | Yes      | Type "production" to confirm              |
| `skip_tests`         | No       | Skip tests (only if already passed in CI) |

---

## Workflow Jobs

The production workflow has **three jobs**:

```
1. Validate
   └── Check that "production" was typed correctly

2. Test (optional)
   └── Run pnpm precheck if not skipped

3. Deploy
   └── Build and deploy to Firebase
```

### Job Dependencies

```
validate ─────┬───── test ─────┬───── deploy
              │                │
        (required)      (required OR skipped)
```

---

## Environment Protection

The workflow uses the GitHub Environment `main`:

```yaml
environment:
  name: main
  url: https://example.com
```

### Recommended Protection Rules

1. Go to **Repository Settings** → **Environments** → **main**
2. Configure:
   - ✅ **Required reviewers** - Add 1-2 approvers
   - ✅ **Wait timer** - Optional cooldown (e.g., 5 minutes)
   - ✅ **Branch restrictions** - Only allow `main` branch
   - ✅ **Deployment branches** - Selected branches only

---

## The Workflow Code

The actual workflow is at `.github/workflows/deploy-main.yml`:

```yaml
name: Deploy to Main (Production)

on:
  workflow_dispatch:
    inputs:
      confirm_production:
        description: 'Type "production" to confirm deployment'
        required: true
        type: string
      skip_tests:
        description: 'Skip tests'
        required: false
        type: boolean
        default: false

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Validate confirmation
        if: ${{ github.event.inputs.confirm_production != 'production' }}
        run: |
          echo "::error::You must type 'production' to confirm"
          exit 1

  test:
    needs: validate
    if: ${{ github.event.inputs.skip_tests != 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... setup steps ...
      - run: pnpm precheck

  deploy:
    needs: [validate, test]
    if: always() && needs.validate.result == 'success'
    runs-on: ubuntu-latest

    permissions:
      id-token: write
      contents: read

    environment:
      name: main

    steps:
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SA_EMAIL }}

      - name: Deploy
        run: firebase deploy --only hosting
```

---

## How to Deploy to Production

### Step 1: Ensure Code is Ready

1. Code has been tested on `stage`
2. QA has approved
3. Stakeholders have signed off

### Step 2: Merge to Main

```bash
# Create PR from stage to main
# Or merge directly:
git checkout main
git merge stage
git push origin main
```

### Step 3: Trigger Deployment

1. Go to **Actions** tab in GitHub
2. Select **Deploy to Main (Production)**
3. Click **Run workflow**
4. Type `production` in the confirmation field
5. (Optional) Check "Skip tests" if already verified
6. Click **Run workflow**

### Step 4: Monitor

1. Watch the workflow progress
2. If environment protection is configured, approve when prompted
3. Verify deployment at production URL

---

## Post-Deployment Checklist

The workflow outputs a checklist in the summary:

- [ ] Verify application is accessible
- [ ] Check error monitoring (Sentry, etc.)
- [ ] Monitor performance metrics
- [ ] Watch for user-reported issues
- [ ] Monitor logs for first 15 minutes

---

## Rollback Procedure

If something goes wrong:

### Option 1: Redeploy Previous Version

```bash
# Find the last working commit
git log --oneline -10

# Create a revert
git revert HEAD
git push origin main

# Trigger deployment again
```

### Option 2: Firebase Rollback

```bash
# List previous versions
firebase hosting:releases:list --limit 10

# Rollback to specific version
firebase hosting:rollback
```

### Option 3: Deploy from Stage

If stage is known to be stable:

1. Reset main to stage: `git reset --hard stage`
2. Force push: `git push origin main --force-with-lease`
3. Trigger deployment

---

## Security Considerations

### Principle of Least Privilege

The production service account should have **only** necessary permissions:

- `roles/firebase.admin` - For hosting/functions deployment
- `roles/iam.serviceAccountUser` - To act as itself

### Audit Trail

All production deployments are tracked:

- GitHub Actions provides full logs
- GCP IAM logs show credential usage
- Firebase shows deployment history

### Require Reviews

Always configure:

- Required reviewers on the `main` environment
- CODEOWNERS for critical files
- Branch protection on `main` branch

---

## Troubleshooting

### "Validation failed"

**Cause**: Didn't type "production" exactly.

**Fix**: Trigger again and type `production` (lowercase, no quotes).

### "Test job failed"

**Cause**: Tests didn't pass.

**Fix**:

1. Check the test logs
2. Fix the issue
3. Merge fix to main
4. Try again

Or if tests already passed in CI:

- Trigger with "Skip tests" enabled

### "Approval pending"

**Cause**: Environment requires approval.

**Fix**:

1. Wait for required reviewer to approve
2. Or modify environment settings to remove requirement

---

## Related Files

- [Deploy-Dev.md](Deploy-Dev.md) - Development deployment workflow
- [Deploy-Stage.md](Deploy-Stage.md) - Staging deployment workflow
- [CI-CD-Pipeline-Guide.md](CI-CD-Pipeline-Guide.md) - Overview and concepts
- [setup-wif.sh](../../scripts/setup-wif.sh) - WIF setup script
