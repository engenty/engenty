# `apps/docs` — docs site app (`@engenty/docs`)

Next.js + Fumadocs. **Do not** duplicate long-form docs here; content lives in [`docs/content`](../../docs/content) (`help/`, `dev/`, `wip/`, plus root `README` / `AGENTS`).

## Section chooser (sidebar tabs)

Fumadocs builds the dropdown from folders whose `meta.json` includes **`"root": true`**. We use **Help**, **Developer**, and **WIP** (`docs/content/help`, `dev`, `wip`). Hub pages stay at the content root (`README`, `AGENTS`). Top-level order: `docs/content/meta.json` → `pages`. Each tab’s sidebar shows only that subtree (`TreeContextProvider` in Fumadocs UI).

## Wiring

- **`source.config.ts`** — `dir` points at `../../docs/content` (Fumadocs collection root). Changing it requires `fumadocs-mdx` (runs on `postinstall` and before build).
- **`lib/source.ts`** — `loader()` + `getLLMText` content root must stay aligned with `source.config.ts` `dir`.
- **`lib/docs-github-path.ts`** — Maps `page.path` to GitHub blob URLs; add entries when symlinking `packages/*/docs` under `docs/content/dev/packages/`.
- **Theme** — `app/global.css` maps Fumadocs `--color-fd-*` onto the Ember primitives, then adds the docs' own dialect (pixel 9-slice windows `.hb-window`/`.hb-bar`, `.hb-bubble`, `.hb-btn`, section tones via `data-tone`). Section colour + mascot per root folder: `components/brand/section-tone.ts`. Page/hero titles are Jersey 25, chrome is Jersey 20 (`--f-chrome`), section headings are Geist 800; pixel fonts (`--f-chrome`, `--f-pixel`) are chrome only. The start-page lobby is a live three.js scene (`components/brand/lobby-room-3d.ts`) drawn at 240×168 with a depth-outline pass, sharing the tile grid in `pixel-room-geometry.ts`.
- **Mascots** — `@engenty/ui-core/components/engenty` resolves through `tsconfig.json` `paths` straight to ui-core source (`experimental.externalDir` in `next.config.mjs`), same as `apps/www` does with a Vite alias. The home page's pixel-art room is `components/brand/pixel-room.tsx` (canvas, 1× then `image-rendering: pixelated`).
- **`.source/`** — Generated; gitignored.
- **Mermaid** — `remarkMdxMermaid` in `source.config.ts` runs **first** in the remark pipeline (`remarkPlugins: (preset) => [remarkMdxMermaid, ...preset]`), turning ` ```mermaid ` fences into `<Mermaid />`. Client component: `components/mdx/mermaid.tsx`; registered in `mdx-components.tsx`. `next.config.mjs` sets `transpilePackages: ["mermaid"]`. Theme follows `next-themes` (Fumadocs `RootProvider`). After changing `source.config.ts`, run `pnpm exec fumadocs-mdx` (or `pnpm install` / build) so `.source` regenerates, then restart dev.
- **Twoslash** — `transformerTwoslash()` + `fumadocs-twoslash/twoslash.css` in `app/global.css`; UI components from `fumadocs-twoslash/ui` merged in `mdx-components.tsx`. Use ` ```ts twoslash ` (or `tsx`) in content. `next.config.mjs` sets `serverExternalPackages: ['typescript', 'twoslash']`. Shiki `langs` are listed explicitly in `source.config.ts` (required for Twoslash popups).

## Commands

From repo root: `pnpm dev:docs`, `pnpm --filter @engenty/docs build`, `pnpm --filter @engenty/docs types:check`. From this app: `pnpm exec biome check .`.

## Env (optional)

`NEXT_PUBLIC_DOCS_SITE_URL`, `NEXT_PUBLIC_DOCS_GITHUB_REPO_BLOB_ROOT` (or legacy `NEXT_PUBLIC_DOCS_GITHUB_BLOB_PREFIX` ending in `/docs/content`) — see [`README.md`](./README.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
