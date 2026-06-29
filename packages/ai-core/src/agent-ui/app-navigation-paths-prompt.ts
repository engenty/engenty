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
    "| Area | Pattern |",
    "|------|---------|",
    "| Dashboard | `/dashboard` |",
    "| Full-page chat | `/chat`, `/chat/<threadId>` |",
    "| App settings | `/settings`, `/settings/ai`, `/settings/ai-usage`, `/settings/appearance` |",
    "| Tenant plugins (admin) | `/admin/plugins` |",
    "| Agents / AI workspace | `/admin/engenty` (sessions, agents, skills, actions under this prefix) |",
    "| Module plugins | `/mdl/<module-folder>` — list: `/mdl/<module-folder>`; detail: `/mdl/<module-folder>/<id>`; edit: `/mdl/<module-folder>/<id>/edit` |",
    "| Knowledge Base (per KB slug) | `/mdl/knowledge-base/<kbSlug>` — articles list: `.../articles`; article: `.../<articleId>`; edit: `.../<articleId>/edit`; new draft: `.../new/edit` |",
    "",
    "REST APIs use snake_case fields (e.g. `kb_id` UUID in JSON/query). **Routes** use the KB **slug** and article **id** (UUID) in the path. If you lack `kbSlug` or `articleId`, read them from tool or `engentyApi` results — do not guess UUIDs or slugs.",
  ].join("\n");
}
