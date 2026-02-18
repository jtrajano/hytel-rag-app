# Contributing to The Hytel Way

Thank you for your interest in contributing to this project! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org/)
- **pnpm 8+** - Install with `npm install -g pnpm`
- **Git** - For version control

### Getting Started

1. **Clone the repository**

   ```bash
   git clone <your-repo-url>
   cd hytel-react-boilerplate
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Start development server**

   ```bash
   pnpm dev
   ```

## Branch Strategy

We use three main branches that map to environments:

| Branch  | Environment | Purpose                          |
| ------- | ----------- | -------------------------------- |
| `dev`   | Development | Latest features, may be unstable |
| `stage` | Staging     | Pre-production testing, QA       |
| `main`  | Production  | Live user-facing application     |

### Workflow

1. Create feature branches from `dev`
2. Open PR to `dev` branch
3. After testing, changes flow: `dev` → `stage` → `main`

## Development Workflow

### Before You Start

1. Make sure you're on the `dev` branch and it's up to date:

   ```bash
   git checkout dev
   git pull origin dev
   ```

2. Create a new branch for your feature:

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. Make your changes

4. Test locally:

   ```bash
   pnpm precheck  # Runs lint, typecheck, build, and test
   ```

### Creating a Changeset

When you've made changes that should be released, create a changeset:

```bash
pnpm changeset
```

This will ask you:

1. Which packages have changed
2. What kind of change (major/minor/patch)
3. A summary of the change

### Making a Pull Request

1. Push your branch:

   ```bash
   git push -u origin feature/your-feature-name
   ```

2. Create a Pull Request targeting the `dev` branch

3. Wait for CI to pass (lint, typecheck, build, test)

4. Request a review

### After Merge

Once your PR is merged to `dev`:

- CI pipeline runs automatically
- Deployment to dev environment triggers automatically
- If there are changesets, a "Version Packages" PR will be created

## Code Standards

### Linting

We use ESLint for code quality:

```bash
pnpm lint        # Check for issues
pnpm lint:fix    # Auto-fix issues
```

### Formatting

We use Prettier for code formatting:

```bash
pnpm format       # Format all files
pnpm format:check # Check formatting
```

### Type Checking

We use TypeScript for type safety:

```bash
pnpm typecheck
```

### Testing

We use Vitest for unit testing:

```bash
pnpm test            # Run tests once
pnpm test:coverage   # Run with coverage
```

## Git Hooks

This project uses Husky for Git hooks:

- **pre-commit**: Runs lint-staged on staged files (ESLint + Prettier)

This ensures code quality before commits are made.

## CI/CD Pipeline

### Continuous Integration

Every pull request triggers:

- Lint checks
- Format checks
- Type checking
- Build verification
- Unit tests
- Dependency consistency check (Syncpack)

### Continuous Deployment

| Branch  | Environment | Trigger                        |
| ------- | ----------- | ------------------------------ |
| `dev`   | Development | Auto on push                   |
| `stage` | Staging     | Auto on push                   |
| `main`  | Production  | Manual (requires confirmation) |

All deployments use **Workload Identity Federation (WIF)** for secure, keyless authentication with GCP.

## Project Structure

```
├── .github/
│   ├── workflows/        # CI/CD pipelines
│   ├── CODEOWNERS        # Auto-assign reviewers
│   ├── ISSUE_TEMPLATE/   # Issue templates
│   └── PULL_REQUEST_TEMPLATE.md
├── .husky/               # Git hooks
├── .changeset/           # Changeset configuration
├── apps/
│   ├── web/              # React frontend (Vite + Tailwind)
│   └── functions/        # tRPC backend
├── packages/
│   ├── ui/               # Shared React components
│   ├── shared/           # Shared Zod schemas
│   ├── eslint-config/    # ESLint configuration
│   └── typescript-config/# TypeScript configuration
├── docs/ci-cd/           # CI/CD documentation
└── scripts/              # Setup scripts (WIF, etc.)
```

## Available Scripts

| Command              | Description                                   |
| -------------------- | --------------------------------------------- |
| `pnpm dev`           | Start development servers                     |
| `pnpm build`         | Build all packages                            |
| `pnpm test`          | Run all tests                                 |
| `pnpm test:coverage` | Run tests with coverage                       |
| `pnpm lint`          | Lint all packages                             |
| `pnpm lint:fix`      | Auto-fix lint issues                          |
| `pnpm format`        | Format all files                              |
| `pnpm format:check`  | Check formatting                              |
| `pnpm typecheck`     | Run type checking                             |
| `pnpm precheck`      | Run all checks (lint, typecheck, build, test) |
| `pnpm changeset`     | Create a new changeset                        |
| `pnpm sync:lint`     | Check dependency consistency                  |

## Need Help?

- Check the [README.md](README.md) for project overview
- Read the [CI/CD documentation](docs/ci-cd/CI-CD-Pipeline-Guide.md)
- Review existing issues and PRs
- Ask questions in discussions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
