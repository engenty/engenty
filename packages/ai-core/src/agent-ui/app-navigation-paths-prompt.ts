/**
 * Canonical in-app path patterns for copilot prompts.
 *
 * Keep aligned with `apps/ui` authenticated routes and module plugins
 * (e.g. `modules/knowledge-base/ui/kb-paths.ts`).
 */
export function buildAppNavigationPathsPromptSection(): string {
  return [
    "## App navigation paths (canonical)",
    "",
    "When you link the user to places inside Engenty, use **path-only** URLs beginning with `/` (same origin as the UI). Do **not** invent hostnames. Do **not** use legacy patterns such as `/kb/<uuid>/articles/...` unless the user or a tool response explicitly shows them.",
    "",
    "The patterns below are conventions, not a route table — only the running app knows which pages exist. The `navigate` tool checks against the real routes: it resolves a module prefix when that module has exactly one page, and otherwise fails listing the routes that do exist. Say a page is open only when `navigate` returned it in `to`.",
    "",
    "| Area | Pattern |",
    "|------|---------|",
    "| Dashboard | `/dashboard` |",
    "| Full-page chat | `/chat`, `/chat/<threadId>` |",
    "| App settings | `/settings`, `/settings/appearance` |",
    "| AI models & usage (settings) | `/settings/ai` |",
    "| Tenant plugins (setup) | `/setup/plugins` |",
    "| Roles & permissions (setup) | `/setup/roles` |",
    "| Agents / AI workspace | `/admin/engenty` (sessions, agents, skills, actions under this prefix) |",
    // A prefix is not a page: over half the modules register no bare
    // `/mdl/<module-folder>` route, and it fell through to the catch-all.
    "| Module plugins | Pages live under `/mdl/<module-folder>/…`. Common shapes where a module has them: list `/mdl/<module-folder>`; detail `/mdl/<module-folder>/<id>`; edit `/mdl/<module-folder>/<id>/edit`; settings `/mdl/<module-folder>/settings`. These are conventions, not guarantees. |",
    "| Knowledge Base (per KB slug) | `/mdl/knowledge-base/<kbSlug>` — articles list: `.../articles`; article: `.../<articleId>`; edit: `.../<articleId>/edit`; new draft: `.../new/edit` |",
    "",
    "REST APIs use snake_case fields (e.g. `kb_id` UUID in JSON/query). **Routes** use the KB **slug** and article **id** (UUID) in the path. If you lack `kbSlug` or `articleId`, read them from tool or `engentyApi` results — do not guess UUIDs or slugs.",
  ].join("\n");
}
