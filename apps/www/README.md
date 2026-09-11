# `@engenty/www`

Public marketing site for self-hosted, Fair Source engenty.

```bash
pnpm --filter @engenty/www dev:app
```

Open **http://localhost:3003** or, with Portless, **https://www.engenty.localhost**.

The page uses the same design tokens and flat animated `Engenty` marks as auth (`DESIGN.md`). Locales live at `/en` and `/de`; `/` redirects from `navigator.languages`. It does not talk to core or the database.
