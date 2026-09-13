# engenty

The engenty command line, from anywhere.

```bash
npx engenty create my-engenty      # clone this release, pnpm install, run its setup
npx engenty deploy                 # self-host wizard — on the server or a laptop
npx engenty deploy migrate         # apply this release's migrations (SUPABASE_DB_URL)
npx engenty doctor                 # this machine's prerequisites
npx engenty doctor --remote --url https://<ref>.supabase.co --anon-key … --service-key …
```

Inside a checkout, `npx engenty …` runs the checkout's own CLI (`pnpm engenty …`),
so every command — including the ones installed modules add — is the version
the checkout is at.

Source: the `packages/cli` workspace package of
[engenty/engenty](https://github.com/engenty/engenty). Docs:
[Setup process](https://github.com/engenty/engenty/blob/main/docs/content/dev/setup-process.md).
