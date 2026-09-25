/**
 * Canonical in-app path patterns for copilot prompts.
 *
 * Keep aligned with `apps/ui` authenticated routes, Space route mirrors
 * (`spaceModuleUrlSegment` / `SPACE_MODULE_URL_ALIASES`), and module plugins
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
    "Never link to `/admin/engenty/…`: that area is a superadmin debugging surface, not a page for the user. Agents live on their Space desk (`?panel=manage` for their settings and workflows awaiting publish); a published workflow runs at `/s/<space_key>/workflows/<id>`.",
    "",
    "Inside a Space, prefer `/s/<space_key>/…`. The module URL segment comes from the running route mirror and is **not** always the module id — do not assume `moduleId === segment`. Example: `knowledge-base` is `/s/<space_key>/kb/…`, not `/s/<space_key>/knowledge-base/…`. Let `navigate` resolve the real route table.",
    "",
    "| Area | Pattern |",
    "|------|---------|",
    "| Space home | `/s/<space_key>` |",
    "| Space-mounted module | `/s/<space_key>/<module-segment>/…` — `<module-segment>` is the route mirror short form, not the module id |",
    "| Space Data | `/s/<space_key>/data` |",
    "| Space settings | `/s/<space_key>/settings` |",
    "| Copilot inside a Space | `/s/<space_key>/copilot` — the user's one private copilot conversation, opened at this Space; there are no per-thread URLs |",
    "| Space agent roster | `/s/<space_key>/agents` |",
    "| Space agent desk | `/s/<space_key>/agents/<agentId>`; hire: `/s/<space_key>/agents/new` |",
    "| Space workflow | `/s/<space_key>/workflows/<id>` |",
    "| Dashboard | `/dashboard` |",
    "| Copilot (outside a Space) | `/copilot` — the same conversation |",
    "| App settings | `/settings`, `/settings/appearance`, `/settings/tenant` |",
    "| AI models & usage (settings) | `/settings/ai` |",
    "| Users (settings) | `/settings/users` |",
    "| Tenant plugins (setup) | `/setup/plugins` |",
    "| Roles & permissions (setup) | `/setup/roles` |",
    "| Audit logs (setup) | `/setup/audit-logs` |",
    // A prefix is not a page: over half the modules register no bare
    // `/mdl/<module-folder>` route, and it fell through to the catch-all.
    "| Module plugins | Pages live under `/mdl/<module-folder>/…`. Common shapes where a module has them: list `/mdl/<module-folder>`; detail `/mdl/<module-folder>/<id>`; edit `/mdl/<module-folder>/<id>/edit`; settings `/mdl/<module-folder>/settings`. These are conventions, not guarantees. Legacy `/mdl/` links redirect into the Space mirror when that module is Space-placed. Record results from module operations carry a ready `link` — use it verbatim instead of building one. |",
    "| Knowledge Base (one per space) | `/mdl/knowledge-base` — articles list: `.../articles`; article: `.../<articleId>`; edit: `.../<articleId>/edit`; new draft: `.../new/edit`. Inside a Space the same pages are `/s/<space_key>/kb/…`. Every KB tool result (knowledge base, article, FAQ, category, source) carries a ready `link` in that form — use it verbatim rather than building one. |",
    "",
    "REST APIs use snake_case fields (e.g. `kb_id` UUID in JSON/query). **Routes** use the KB **slug** and article **id** (UUID) in the path. If you lack `kbSlug` or `articleId`, read them from tool or `engentyApi` results — do not guess UUIDs or slugs.",
  ].join("\n");
}
