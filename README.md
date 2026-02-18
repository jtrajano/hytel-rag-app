# The Hytel Way: Monorepo Stack

A production-ready monorepo template featuring React, TypeScript, Tailwind CSS, Shadcn UI, tRPC, and TanStack Query. Built with pnpm and Turborepo for optimal developer experience.

## Stack Overview

Think of building a web app like putting on a theater production!

| Tool               | Role            | Analogy                                        |
| ------------------ | --------------- | ---------------------------------------------- |
| **pnpm**           | Package Manager | The super-organized prop master                |
| **Turborepo**      | Build System    | The stage manager coordinating tasks           |
| **React + Vite**   | Frontend        | The stage and lighting system                  |
| **TypeScript**     | Type Safety     | The script ensuring everyone knows their lines |
| **Tailwind CSS**   | Styling         | The costume designer's fabric swatches         |
| **Shadcn UI**      | Components      | Pre-made costume patterns                      |
| **tRPC**           | API Layer       | The messenger between actors                   |
| **TanStack Query** | Data Fetching   | Smart caching (remembers the script!)          |
| **Vitest**         | Testing         | Dress rehearsals before the show               |
| **Zod**            | Validation      | The bouncer checking IDs                       |

## Monorepo Structure

```
├── .github/
│   ├── workflows/        # CI/CD pipelines (ready to use!)
│   ├── CODEOWNERS        # Auto-assign reviewers
│   └── ISSUE_TEMPLATE/   # Issue & PR templates
│
├── apps/
│   ├── web/              # React frontend (Vite + Tailwind)
│   │   ├── src/
│   │   │   ├── App.tsx   # Main application component
│   │   │   ├── hooks/    # Custom React hooks
│   │   │   ├── lib/      # Utilities (tRPC client, query client)
│   │   │   └── providers/# Context providers
│   │   └── public/       # Static assets
│   │
│   └── functions/        # tRPC backend
│       └── src/trpc/     # API routers and procedures
│
├── packages/
│   ├── ui/               # Shared React components
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── Counter.tsx
│   │   │   └── ui/       # Shadcn UI components (Button, Card)
│   │   └── lib/utils.ts  # Tailwind class merging utility
│   │
│   ├── shared/           # Shared Zod schemas & types
│   │   └── src/schemas/  # User schemas, validation rules
│   │
│   ├── eslint-config/    # Shared ESLint configuration
│   └── typescript-config/# Shared TypeScript configuration
│
├── docs/ci-cd/           # CI/CD documentation
├── scripts/              # Setup scripts (WIF, etc.)
├── turbo.json            # Turborepo pipeline configuration
├── pnpm-workspace.yaml   # Workspace definition
└── package.json          # Root scripts
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd hytel-react-boilerplate

# Install dependencies
pnpm install
```

### Development

```bash
# Start the development server
pnpm dev
# Opens at http://localhost:5173

# Run all quality checks
pnpm precheck

# Run tests
pnpm test

# Build for production
pnpm build

# Lint code
pnpm lint

# Format code
pnpm format
```

## Key Features

### Shared Components (`packages/ui`)

Components in `@repo/ui` can be used by any app in the monorepo:

```tsx
import { Header } from '@repo/ui/Header'
import { Button } from '@repo/ui/Button'
import { Card, CardHeader, CardContent } from '@repo/ui/Card'
```

### Type-Safe API (`apps/functions`)

tRPC provides end-to-end type safety:

```tsx
// Backend (apps/functions)
export const userRouter = router({
  create: publicProcedure
    .input(CreateUserSchema)
    .mutation(({ input }) => ({ id: 'new-id', ...input })),
})

// Frontend (apps/web)
const { mutate } = trpc.user.create.useMutation()
```

### Shared Schemas (`packages/shared`)

Zod schemas shared between frontend and backend:

```tsx
import { UserSchema, CreateUserSchema } from '@repo/shared'

// Type-safe validation everywhere!
const user = UserSchema.parse(data)
```

## Scripts Reference

| Command              | Description                                   |
| -------------------- | --------------------------------------------- |
| `pnpm dev`           | Start development servers                     |
| `pnpm build`         | Build all packages for production             |
| `pnpm test`          | Run all tests                                 |
| `pnpm test:coverage` | Run tests with coverage report                |
| `pnpm lint`          | Lint all packages                             |
| `pnpm lint:fix`      | Auto-fix lint issues                          |
| `pnpm format`        | Format code with Prettier                     |
| `pnpm format:check`  | Check code formatting                         |
| `pnpm typecheck`     | Run TypeScript type checking                  |
| `pnpm precheck`      | Run all checks (lint, typecheck, build, test) |
| `pnpm changeset`     | Create a changeset for versioning             |
| `pnpm sync:lint`     | Check dependency version consistency          |
| `pnpm sync:fix`      | Fix dependency version mismatches             |

---

## CI/CD Pipeline

This template includes a **fully configured CI/CD pipeline** using GitHub Actions and Workload Identity Federation (WIF) for secure deployments.

### Branch Strategy

| Branch  | Environment | Deployment                 |
| ------- | ----------- | -------------------------- |
| `dev`   | Development | Auto on push               |
| `stage` | Staging     | Auto on push               |
| `main`  | Production  | Manual (with confirmation) |

### GitHub Actions Workflows

| Workflow                | Trigger         | Purpose                              |
| ----------------------- | --------------- | ------------------------------------ |
| `ci.yml`                | PR & push       | Lint, typecheck, build, test         |
| `deploy-dev.yml`        | Push to `dev`   | Deploy to development                |
| `deploy-stage.yml`      | Push to `stage` | Deploy to staging                    |
| `deploy-main.yml`       | Manual          | Deploy to production                 |
| `release.yml`           | Push to `main`  | Automated versioning with Changesets |
| `dependency-review.yml` | PR              | Check for vulnerable dependencies    |

### Workload Identity Federation (WIF)

All deployments use **keyless authentication** with GCP:

- No stored service account keys
- Short-lived tokens (expire in ~1 hour)
- Full audit trail in GCP

### Required GitHub Secrets

Configure these in your repository settings:

| Secret                           | Description           |
| -------------------------------- | --------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF provider path     |
| `GCP_SA_EMAIL`                   | Service account email |

### Setup Instructions

1. **Configure WIF** using `scripts/setup-wif.sh`
2. **Add secrets** to GitHub repository settings
3. **Create environments** (`dev`, `stage`, `main`) in GitHub settings
4. **Push to branches** to trigger deployments

See [docs/ci-cd/CI-CD-Pipeline-Guide.md](docs/ci-cd/CI-CD-Pipeline-Guide.md) for detailed setup instructions.

---

## Development Tools

### Git Hooks (Husky)

Pre-commit hooks automatically run:

- ESLint on staged `.ts`/`.tsx` files
- Prettier on staged files

### Changesets

Semantic versioning for the monorepo:

```bash
# Create a changeset when you make changes
pnpm changeset

# The release workflow handles version bumps automatically
```

### Syncpack

Dependency consistency across packages:

```bash
pnpm sync:lint   # Check for mismatches
pnpm sync:fix    # Auto-fix mismatches
pnpm sync:list   # List all versions
```

---

## Testing

Each package has its own tests:

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter web test
pnpm --filter @repo/ui test
pnpm --filter @repo/shared test
pnpm --filter @repo/functions test

# Run with coverage
pnpm test:coverage
```

---

## Adding New Packages

### New App

```bash
mkdir apps/new-app
cd apps/new-app
pnpm init
```

### New Shared Package

```bash
mkdir packages/new-package
cd packages/new-package
pnpm init
```

Packages are auto-discovered via `pnpm-workspace.yaml` (configured for `apps/*` and `packages/*`).

---

## Version Requirements

| Tool         | Minimum Version        |
| ------------ | ---------------------- |
| Node.js      | 20.x                   |
| pnpm         | 8.x                    |
| Turbo        | 2.x                    |
| TypeScript   | 5.x                    |
| Vitest       | 2.x                    |
| ESLint       | 8.x                    |
| Prettier     | 3.x                    |
| Firebase CLI | 13.x (for deployment)  |
| gcloud CLI   | Latest (for WIF setup) |

---

## Useful Links

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Shadcn UI Components](https://ui.shadcn.com)
- [tRPC Documentation](https://trpc.io)
- [TanStack Query](https://tanstack.com/query)
- [Tailwind CSS](https://tailwindcss.com)
- [Vite](https://vitejs.dev)
- [Changesets](https://github.com/changesets/changesets)
- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines.

---

Built with ❤️ using Turborepo
