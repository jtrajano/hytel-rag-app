# Continuous Integration (CI) Workflow

> This document explains the CI workflow.
> The actual workflow file is located at `.github/workflows/ci.yml`.

**Prerequisites**: Read [CI-CD-Pipeline-Guide.md](CI-CD-Pipeline-Guide.md) first.

**Next**: [Deploy-Dev.md](Deploy-Dev.md) - Development deployment workflow

---

## Overview

The CI workflow runs on every Pull Request to ensure code quality before merging. It performs:

1. **Linting** - Code style and error checking
2. **Type Checking** - TypeScript validation
3. **Building** - Compile all packages
4. **Testing** - Run unit tests

---

## The Workflow File

Below is the complete `ci.yml` workflow with annotations explaining each section.

```yaml
# ============================================================================
# ci.yml - Continuous Integration Workflow
# ============================================================================
# This workflow runs on every pull request to the main branch.
# It ensures code quality by running lint, typecheck, build, and test.
#
# EDUCATIONAL TEMPLATE - Replace all <YOUR-VALUE-HERE> placeholders
# before copying to .github/workflows/
# ============================================================================

name: CI # <-- Display name shown in GitHub Actions UI

# ============================================================================
# TRIGGERS
# ============================================================================
# Defines when this workflow runs
on:
  pull_request:
    branches:
      - main # <-- Run on PRs targeting main (production)
      - dev # <-- Run on PRs targeting dev
      - stage # <-- Run on PRs targeting stage
  push:
    branches:
      - main # <-- Run on pushes to main
      - dev # <-- Run on pushes to dev

# ============================================================================
# CONCURRENCY
# ============================================================================
# Prevents multiple CI runs for the same PR from running simultaneously
# If a new commit is pushed, the old run is cancelled
concurrency:
  group: ci-${{ github.ref }} # <-- Group by branch/PR
  cancel-in-progress: true # <-- Cancel old runs

# ============================================================================
# JOBS
# ============================================================================
jobs:
  ci:
    name: Lint, Type Check, Build, Test
    runs-on: ubuntu-latest # <-- Use GitHub's Ubuntu runner

    steps:
      # ======================================================================
      # STEP 1: Checkout Code
      # ======================================================================
      # Clones your repository to the runner
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 2 # <-- Fetch 2 commits for diff detection

      # ======================================================================
      # STEP 2: Setup pnpm
      # ======================================================================
      # Installs pnpm package manager
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8 # <-- Match your local pnpm version

      # ======================================================================
      # STEP 3: Setup Node.js
      # ======================================================================
      # Installs Node.js and configures pnpm cache
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20 # <-- Match your local Node version
          cache: 'pnpm' # <-- Cache pnpm store for faster installs

      # ======================================================================
      # STEP 4: Install Dependencies
      # ======================================================================
      # Installs all project dependencies
      # --frozen-lockfile ensures lock file is respected (no updates)
      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # ======================================================================
      # STEP 5: Turborepo Cache
      # ======================================================================
      # Caches Turborepo build artifacts for faster subsequent runs
      - name: Cache Turborepo
        uses: actions/cache@v4
        with:
          path: .turbo # <-- Turbo cache directory
          key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            turbo-${{ runner.os }}-

      # ======================================================================
      # STEP 6: Lint
      # ======================================================================
      # Runs ESLint and Prettier across all packages
      # Fails fast if there are linting errors
      - name: Lint
        run: pnpm lint

      # ======================================================================
      # STEP 7: Type Check
      # ======================================================================
      # Runs TypeScript compiler in check mode
      # Catches type errors without generating output
      - name: Type check
        run: pnpm exec turbo run typecheck

      # ======================================================================
      # STEP 8: Build
      # ======================================================================
      # Builds all packages using Turborepo
      # Validates that the build succeeds before merging
      - name: Build
        run: pnpm build

      # ======================================================================
      # STEP 9: Test
      # ======================================================================
      # Runs all unit tests using Vitest
      # Includes coverage reporting
      - name: Test
        run: pnpm test
```

---

## Key Concepts Explained

### Why Run CI on Every PR?

- **Catch errors early**: Find bugs before they reach main branch
- **Consistent quality**: Every change goes through the same checks
- **Faster reviews**: Reviewers know the code compiles and tests pass
- **Protected main branch**: Only validated code can be merged

### How Turborepo Speeds Up CI

Turborepo uses **intelligent caching** to skip work that hasn't changed:

```
First Run:
  packages/ui       → Build (cache miss) → 5s
  packages/shared   → Build (cache miss) → 3s
  apps/web          → Build (cache miss) → 15s
  Total: 23s

Second Run (no changes):
  packages/ui       → Build (cache hit)  → 0s
  packages/shared   → Build (cache hit)  → 0s
  apps/web          → Build (cache hit)  → 0s
  Total: <1s
```

### Fail Fast Strategy

The workflow runs steps in order and stops at the first failure:

```
Lint (fastest)
  ↓ Pass
Type Check (fast)
  ↓ Pass
Build (medium)
  ↓ Pass
Test (slowest)
  ↓ Pass
✓ CI Complete
```

If lint fails, we don't waste time building and testing.

---

## Customization Tips

### Adding a New Check

Add a new step after the existing checks:

```yaml
- name: Security Audit
  run: pnpm audit --audit-level=high
```

### Running Tests with Coverage

Modify the test step to include coverage:

```yaml
- name: Test with coverage
  run: pnpm test -- --coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

### Matrix Builds (Multiple Node Versions)

Test across multiple Node.js versions:

```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]
steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node-version }}
```

---

## Best Practices

1. **Keep CI fast** - Aim for under 5 minutes total
2. **Cache aggressively** - Use pnpm and Turborepo caching
3. **Fail fast** - Run quick checks before slow ones
4. **Use frozen lockfile** - Prevent unexpected dependency changes
5. **Match local versions** - Use same Node/pnpm versions as development

---

## Troubleshooting CI Failures

### "ESLint found problems"

```bash
# Run locally to see issues
pnpm lint

# Auto-fix what's possible
pnpm lint --fix
```

### "TypeScript error TS2xxx"

```bash
# Run typecheck locally
pnpm exec turbo run typecheck

# Check specific package
pnpm --filter @repo/ui exec tsc --noEmit
```

### "Test failed"

```bash
# Run tests locally with verbose output
pnpm test -- --reporter=verbose

# Run specific test file
pnpm --filter web test src/App.test.tsx
```

---

## Warning: Do Not Copy Until Ready

> **WARNING**: Do not copy this file to `.github/workflows/` until you have:
>
> 1. Read the [CI-CD-Pipeline-Guide.md](CI-CD-Pipeline-Guide.md)
> 2. Verified your local development environment works
> 3. Ensured `pnpm lint`, `pnpm build`, and `pnpm test` pass locally

---

## Exercise

Try this to understand the workflow better:

1. Copy the YAML above to a temporary file
2. Read through each comment
3. Identify which steps would fail if you had a linting error
4. Consider: What would you add if you needed to run e2e tests?

---

**Next**: Read [Deploy-Dev.md](Deploy-Dev.md) to learn about the deployment workflow.
