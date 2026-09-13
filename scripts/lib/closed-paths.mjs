/**
 * The open/closed boundary of the public mirror (engenty/engenty), in one place.
 *
 * A closed entry is a path that must never reach the public repo. When that path
 * is a plugin, the entry also carries the slug that `engenty.plugins` uses for
 * it — the tree and the manifest have to be filtered together, or the mirror
 * ends up naming a module it does not contain and `pnpm plugins:check` exits 1
 * on its own CI.
 *
 * This used to be three hand-maintained lists — `CLOSED_PREFIXES` in
 * `publish-open.sh`, `EXCLUDES` in `publish-open-snapshot.sh`, and
 * `CLOSED_PLUGIN_SLUGS` — and they drifted twice: `packages/entitlements` was
 * closed in one and absent from another, then `modules/expenses` and
 * `modules/finance-reports` were excluded from the tree by the snapshot script
 * while their slugs stayed in the published manifest. `publish-open-exclusions.test.ts`
 * guards the invariants this file now makes structural.
 *
 * Run it directly to print the paths, one per line, for the bash scripts:
 *   node scripts/lib/closed-paths.mjs
 */

/**
 * @typedef {object} ClosedPath
 * @property {string} path   Repo-relative prefix. Matches the path itself and everything under it.
 * @property {string} [slug] `engenty.plugins` key, when the path is a plugin.
 * @property {string} [note] Why it is closed, when that is not obvious.
 */

/** @type {ClosedPath[]} */
export const CLOSED_PATHS = [
  { path: "apps/manage", note: "Superadmin control plane." },
  {
    path: "apps/www",
    note: "Marketing site, still in work. Local dev does not need it.",
  },
  {
    path: "apps/ui/src/plugins/pro",
    note: "Generated pro-only UI plugin catalog (closed module import()s).",
  },
  { path: "docs/internal" },
  // Pages whose whole subject is a closed module. They shipped to the mirror
  // until 2026-09-12, so the public docs site advertised Time tracking, Apps,
  // remote channels and the Slack bridge to readers whose install has none of
  // them. `scripts/strip-closed-doc-nav.mjs` drops the nav entries and list
  // items that point here, and refuses the publish if any other link survives.
  { path: "docs/content/dev/remote-channels.md", note: "engenty-remote." },
  { path: "docs/content/user/agent-operations/apps.md", note: "engenty-apps." },
  {
    path: "docs/content/user/agent-operations/remote-channels.md",
    note: "engenty-remote.",
  },
  {
    path: "docs/content/user/connect-slack.md",
    note: "The Slack bridge provider is pro-only.",
  },
  {
    path: "docs/content/user/modules/time-tracking.md",
    note: "time-tracking.",
  },
  { path: "modules/banking", slug: "banking" },
  {
    path: "modules/engenty-apps",
    slug: "engenty-apps",
    note: "Pro-only for now (decision 2026-07-25, PLAN-engenty-apps.md §9).",
  },
  {
    path: "modules/engenty-remote",
    slug: "engenty-remote",
    note: "Starts pro-only (decision pending broader open-sourcing).",
  },
  { path: "modules/expenses", slug: "expenses" },
  { path: "modules/finance-reports", slug: "finance-reports" },
  {
    path: "modules/team-chat/providers/slack-bridge",
    slug: "team-chat-slack-bridge",
    note: "The team-chat module is open; its Slack bridge is a pro provider (decision 2026-07-17, built 2026-07-19).",
  },
  { path: "modules/team-hr", slug: "team-hr" },
  {
    path: "modules/time-tracking",
    slug: "time-tracking",
    note: "Pulled back to pro-only 2026-07-13 — the calendar-sync phase is commercial.",
  },
  { path: "packages/banking" },
  { path: "packages/brand-assets" },
  { path: "packages/document-scanner" },
  { path: "packages/engenty-cli" },
  { path: "packages/entitlements" },
  {
    path: "packages/pdf-service/assets/fonts/fontshare",
    note: "pdf-service went open 2026-07-05, but the ITF Fontshare EULA forbids redistribution. OSS users download them from fontshare.com; the engine degrades when absent.",
  },
  { path: "packages/plate-editor" },
  {
    path: "scripts/dev-portless-minimal.sh",
    note: "Manage-only dev helper (starts core + apps/manage).",
  },
  {
    path: ".github/workflows/build-images.yml",
    note: "Deploy pipeline is engenty-pro-only; on the public repo its token cannot push to pro-owned GHCR packages.",
  },
];

/** Repo-relative prefixes that must never reach the public mirror. */
export const CLOSED_PREFIXES = CLOSED_PATHS.map((entry) => entry.path);

/** `engenty.plugins` keys whose module lives behind a closed prefix. */
export const CLOSED_PLUGIN_SLUGS = CLOSED_PATHS.flatMap((entry) =>
  entry.slug ? [entry.slug] : []
);

/** True when `relativePath` is a closed path or lives under one. */
export function isClosedPath(relativePath) {
  return CLOSED_PREFIXES.some(
    (prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`)
  );
}

if (import.meta.filename === process.argv[1]) {
  process.stdout.write(`${CLOSED_PREFIXES.join("\n")}\n`);
}
