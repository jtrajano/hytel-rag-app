---
trigger: always_on
---

# Workspace Agent Rules

## Tech Stack — Use ONLY These Tools

This project uses a strict tech stack. The AI agent must **never suggest or introduce alternatives** outside of this list.

---

## 📦 Package Manager — `pnpm`

- Always use `pnpm` for installing, running, and managing packages.
- Never suggest `npm`, `yarn`, or `bun`.
- Scripts must be run with `pnpm run <script>` or `pnpm <command>`.

---

## 🏗️ Build System — `Turborepo`

- This is a monorepo managed by Turborepo.
- Build, lint, test, and dev tasks must go through Turborepo pipelines defined in `turbo.json`.
- Never bypass Turborepo to run per-package scripts directly unless debugging.

---

## ⚛️ Frontend — `React` + `Vite`

- All UI is built with React (functional components + hooks only — no class components).
- Vite is the dev server and bundler. Do not suggest Webpack, Next.js, Remix, or any other alternative.
- File extensions: `.tsx` for components, `.ts` for logic.

---

## 🔷 Type Safety — `TypeScript`

- All code must be fully typed. No use of `any` unless absolutely necessary and explicitly commented.
- Prefer `interface` for object shapes and `type` for unions/intersections.
- `strict` mode is enabled — respect it.

---

## 🎨 Styling — `Tailwind CSS`

- All styling must use Tailwind utility classes.
- No CSS modules, styled-components, Emotion, or plain CSS files (except global resets).
- Use `cn()` (from `clsx` + `tailwind-merge`) for conditional class merging.

---

## 🧩 UI Components — `Shadcn UI`

- Use Shadcn UI components as the base for all UI elements.
- Add new components via `pnpm dlx shadcn-ui@latest add <component>`.
- Do not install other component libraries (MUI, Chakra, Mantine, etc.).
- Customize components using Tailwind classes only.

---

## 🔗 API Layer — `tRPC`

- All client-server communication must go through tRPC.
- Never use raw `fetch`, `axios`, or REST endpoints for internal API calls.
- Define procedures in the router and consume them via the tRPC React client.

---

## 📡 Data Fetching — `TanStack Query`

- All async data fetching and caching is handled by TanStack Query.
- tRPC hooks already integrate TanStack Query — use them directly.
- Never manually manage loading/error state with `useState` when TanStack Query can handle it.

---

## ✅ Validation — `Zod`

- All data validation (forms, API inputs/outputs, env variables) must use Zod schemas.
- Share Zod schemas between client and server where possible.
- Never use `yup`, `joi`, or manual validation logic.

---

## 🧪 Testing — `Vitest`

- All unit and integration tests must use Vitest.
- Test files are colocated with source files using the `.test.ts` / `.test.tsx` convention.
- Never use Jest or other test runners.
- Run tests with `pnpm run test`.

---

## General Rules for the Agent

1. **Do not introduce any dependency not listed above** without explicit user approval.
2. When generating code, always match the existing patterns in the codebase.
3. Prefer editing existing files over creating new ones when possible.
4. All new components must be typed, use Tailwind for styles, and follow the Shadcn UI pattern.
5. Always validate external data (API responses, form inputs, env vars) with Zod.
6. Keep tRPC procedures small and focused — one responsibility per procedure.
