# `apps/docs` — docs site app (`@engenty/docs`)

Next.js + Fumadocs. **Do not** duplicate long-form docs here; content lives in [`docs/content`](../../docs/content) (`help/`, `dev/`, `wip/`, plus root `README` / `AGENTS`).

## Section chooser (sidebar tabs)

Fumadocs builds the dropdown from folders whose `meta.json` includes **`"root": true`**. We use **Help**, **Developer**, and **WIP** (`docs/content/help`, `dev`, `wip`). Hub pages stay at the content root (`README`, `AGENTS`). Top-level order: `docs/content/meta.json` → `pages`. Each tab’s sidebar shows only that subtree (`TreeContextProvider` in Fumadocs UI).

## Wiring

- **`source.config.ts`** — `dir` points at `../../docs/content` (Fumadocs collection root). Changing it requires `fumadocs-mdx` (runs on `postinstall` and before build).
- **`lib/source.ts`** — `loader()` + `getLLMText` content root must stay aligned with `source.config.ts` `dir`.
- **`lib/docs-github-path.ts`** — Maps `page.path` to GitHub blob URLs; add entries when symlinking `packages/*/docs` under `docs/content/dev/packages/`.
- **`.source/`** — Generated; gitignored.
- **Mermaid** — `remarkMdxMermaid` in `source.config.ts` runs **first** in the remark pipeline (`remarkPlugins: (preset) => [remarkMdxMermaid, ...preset]`), turning ` ```mermaid ` fences into `<Mermaid />`. Client component: `components/mdx/mermaid.tsx`; registered in `mdx-components.tsx`. `next.config.mjs` sets `transpilePackages: ["mermaid"]`. Theme follows `next-themes` (Fumadocs `RootProvider`). After changing `source.config.ts`, run `pnpm exec fumadocs-mdx` (or `pnpm install` / build) so `.source` regenerates, then restart dev.
- **Twoslash** — `transformerTwoslash()` + `fumadocs-twoslash/twoslash.css` in `app/global.css`; UI components from `fumadocs-twoslash/ui` merged in `mdx-components.tsx`. Use ` ```ts twoslash ` (or `tsx`) in content. `next.config.mjs` sets `serverExternalPackages: ['typescript', 'twoslash']`. Shiki `langs` are listed explicitly in `source.config.ts` (required for Twoslash popups).

## Commands

From repo root: `pnpm dev:docs`, `pnpm --filter @engenty/docs build`, `pnpm --filter @engenty/docs types:check`. From this app: `pnpm exec biome check .`.

## Env (optional)

`NEXT_PUBLIC_DOCS_SITE_URL`, `NEXT_PUBLIC_DOCS_GITHUB_REPO_BLOB_ROOT` (or legacy `NEXT_PUBLIC_DOCS_GITHUB_BLOB_PREFIX` ending in `/docs/content`) — see [`README.md`](./README.md).
