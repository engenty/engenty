# Engenty docs site

Next.js + [Fumadocs](https://fumadocs.dev) site app (`@engenty/docs`). Published MDX lives in [`docs/content/`](../../docs/content/): [`help/`](../../docs/content/help), [`dev/`](../../docs/content/dev), [`wip/`](../../docs/content/wip), plus root hub pages (`README`, `AGENTS`). See [`source.config.ts`](./source.config.ts) `dir`.

## Section chooser (sidebar)

Folders whose `meta.json` sets **`"root": true`** become entries in the sidebar dropdown (**Help**, **Developer**, **WIP**). Hub routes stay at `/docs/README` and `/docs/AGENTS` (not separate tabs).

## Run locally

From the monorepo root:

```bash
pnpm dev:docs
```

With API + all frontends (includes this app): `pnpm dev:all` from the repo root (see `docs/dev/quick-start.md`).

Or from this directory after `pnpm install` at the repo root:

```bash
pnpm dev
```

Open **https://docs.engenty.localhost** (Portless; see [portless-local-urls.md](../../docs/dev/portless-local-urls.md)).

Optional env (set via `pnpm portless:env:sync` in repo-root `.env.local`):

- `NEXT_PUBLIC_DOCS_SITE_URL` — canonical site URL for metadata / OG (e.g. `https://engenty.localhost` with the dev gateway; docs paths are under `/docs`).
- `NEXT_PUBLIC_DOCS_GITHUB_REPO_BLOB_ROOT` — GitHub blob root for the repo (no trailing slash), e.g. `https://github.com/engenty/engenty/blob/main`. Used to build “Open in GitHub” for both `docs/content/…` and symlinked `packages/…/docs/…` pages (see `lib/docs-github-path.ts`).
- `NEXT_PUBLIC_DOCS_GITHUB_BLOB_PREFIX` — legacy alternative: if set to `…/blob/<branch>/docs/content`, the repo root is derived by stripping `/docs/content` (otherwise prefer `NEXT_PUBLIC_DOCS_GITHUB_REPO_BLOB_ROOT`).

## Explore

In the project, you can see:

- `lib/source.ts`: Code for content source adapter, [`loader()`](https://fumadocs.dev/docs/headless/source-api) provides the interface to access your content.
- `lib/layout.shared.tsx`: Shared options for layouts, optional but preferred to keep.

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | The route group for your landing page and other pages. |
| `app/docs`                | The documentation layout and pages.                    |
| `app/api/search/route.ts` | The Route Handler for search.                          |

### Fumadocs MDX

A `source.config.ts` config file has been included, you can customise different options like frontmatter schema.

Read the [Introduction](https://fumadocs.dev/docs/mdx) for further details.

## Learn More

To learn more about Next.js and Fumadocs, take a look at the following
resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Fumadocs](https://fumadocs.dev) - learn about Fumadocs
