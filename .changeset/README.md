# Changesets

This folder contains changesets for this monorepo.

## What is a Changeset?

A changeset is a piece of information about changes made in a branch or commit. It holds three bits of information:

- What needs to be released
- What semver bump types are required
- A changelog entry for the released packages

## Usage

### Create a new changeset

When you've made changes that need to be released:

```bash
pnpm changeset
```

This will ask you:

1. Which packages have changed
2. What kind of change (major/minor/patch)
3. A summary of the change

### Version packages

To bump versions based on changesets:

```bash
pnpm version
```

### Publish packages

To publish to npm (if configured):

```bash
pnpm release
```

## Learn More

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Using Changesets with pnpm](https://pnpm.io/using-changesets)
