import "@engenty/tiptap-editor/styles.css";
import { DockEngentyIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import {
  ACTIONS_CATALOG_ROOT_PATH,
  ACTIVITY_ROOT_PATH,
  AGENTS_CATALOG_ROOT_PATH,
  AGENTS_WORKSPACE_ROOT_PATH,
  ARTIFACTS_ROOT_PATH,
  SKILLS_CATALOG_ROOT_PATH,
  TOOLS_ROOT_PATH,
} from "./features/agents-workspace/agent-workspace-paths.js";
import { ActionDetailPage } from "./routes/action-detail-page.js";
import { ActionsCatalogPage } from "./routes/actions-catalog-page.js";
import { ActivityPage } from "./routes/activity-page.js";
import { AgentDetailPage } from "./routes/agent-detail-page.js";
import { AgentFormPage } from "./routes/agent-form-page.js";
import { AgentsCatalogPage } from "./routes/agents-catalog-page.js";
import { ArtifactsCatalogPage } from "./routes/artifacts-catalog-page.js";
import { ArtifactsDetailPage } from "./routes/artifacts-detail-page.js";
import { LegacyRedirect } from "./routes/legacy-redirect.js";
import { OverviewPage } from "./routes/overview-page.js";
import { SkillDetailPage } from "./routes/skill-detail-page.js";
import { SkillsCatalogPage } from "./routes/skills-catalog-page.js";
import { ToolFormPage } from "./routes/tool-form-page.js";
import { ToolsCatalogPage } from "./routes/tools-catalog-page.js";

const RESERVED_SECTIONS = [
  "agents",
  "skills",
  "tools",
  "artifacts",
  "actions",
  "activity",
  // Owned by the connections module (route registered there).
  "connections",
];

export default function plugin(engenty: EngentyPluginContext) {
  engenty.i18n.registerNamespace({
    pluginId: "ai-ui",
    namespace: "ai-ui",
    loadersByLocale: {
      en: () => import("./locales/en.json").then((m) => m.default),
      de: () => import("./locales/de.json").then((m) => m.default),
    },
  });

  // ── Overview / landing ────────────────────────────────────────────────────

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents",
    path: AGENTS_WORKSPACE_ROOT_PATH,
    component: OverviewPage,
    order: 200,
  });

  // ── Agents catalog ────────────────────────────────────────────────────────

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_catalog",
    path: AGENTS_CATALOG_ROOT_PATH,
    component: AgentsCatalogPage,
    order: 201,
  });

  // Create / edit custom agents
  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_new",
    path: `${AGENTS_CATALOG_ROOT_PATH}/new`,
    component: AgentFormPage,
    order: 202,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_edit",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/edit`,
    component: AgentFormPage,
    order: 203,
  });

  // ── Agent detail (sub-paths under /agents/:agentId) ───────────────────────

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_detail",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId`,
    component: AgentDetailPage,
    order: 204,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_capabilities",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/capabilities`,
    component: AgentDetailPage,
    order: 204,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_workspace",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/workspace`,
    component: AgentDetailPage,
    order: 204,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_activity",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/activity`,
    component: AgentDetailPage,
    order: 204,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_instructions",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/instructions`,
    component: AgentDetailPage,
    order: 205,
  });

  engenty.UI.registerRoute({
    id: "ai-ui.admin.agents.sessions-tab",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/sessions`,
    component: AgentDetailPage,
    order: 206,
  });

  engenty.UI.registerRoute({
    id: "ai-ui.admin.agents.session-detail",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/sessions/:threadId`,
    component: AgentDetailPage,
    order: 207,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_memory",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/memory`,
    component: AgentDetailPage,
    order: 208,
  });

  engenty.UI.registerRoute({
    id: "ai-ui.admin.agents.runs-tab",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/runs`,
    component: AgentDetailPage,
    order: 209,
  });

  engenty.UI.registerRoute({
    id: "ai-ui.admin.agents.run-detail",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/runs/:runId`,
    component: AgentDetailPage,
    order: 210,
  });

  // ── Activity (sessions + runs feed) ───────────────────────────────────────

  engenty.UI.registerRoute({
    id: "ai_ui_admin_activity",
    path: ACTIVITY_ROOT_PATH,
    component: ActivityPage,
    order: 215,
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  engenty.UI.registerRoute({
    id: "ai_ui_admin_actions",
    path: ACTIONS_CATALOG_ROOT_PATH,
    component: ActionsCatalogPage,
    order: 219,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_actions_detail",
    path: `${ACTIONS_CATALOG_ROOT_PATH}/:actionId`,
    component: ActionDetailPage,
    order: 220,
  });

  // ── Skills ────────────────────────────────────────────────────────────────

  engenty.UI.registerRoute({
    id: "ai_ui_admin_skills",
    path: SKILLS_CATALOG_ROOT_PATH,
    component: SkillsCatalogPage,
    order: 221,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_skills_detail",
    path: `${SKILLS_CATALOG_ROOT_PATH}/:skillId`,
    component: SkillDetailPage,
    order: 225,
  });

  // ── Artifacts ─────────────────────────────────────────────────────────────

  engenty.UI.registerRoute({
    id: "ai_ui_admin_artifacts",
    path: ARTIFACTS_ROOT_PATH,
    component: ArtifactsCatalogPage,
    order: 217,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_artifacts_detail",
    path: `${ARTIFACTS_ROOT_PATH}/:artifactId`,
    component: ArtifactsDetailPage,
    order: 218,
  });

  // ── Tools ─────────────────────────────────────────────────────────────────

  engenty.UI.registerRoute({
    id: "ai_ui_admin_tools",
    path: TOOLS_ROOT_PATH,
    component: ToolsCatalogPage,
    order: 226,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_tools_new",
    path: `${TOOLS_ROOT_PATH}/new`,
    component: ToolFormPage,
    order: 227,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_tools_edit",
    path: `${TOOLS_ROOT_PATH}/:toolId/edit`,
    component: ToolFormPage,
    order: 228,
  });

  // ── Legacy redirects ──────────────────────────────────────────────────────
  // /sessions → /activity
  engenty.UI.registerRoute({
    id: "ai_ui_legacy_sessions_redirect",
    path: `${AGENTS_WORKSPACE_ROOT_PATH}/sessions`,
    component: () => LegacyRedirect({ to: ACTIVITY_ROOT_PATH }),
    order: 230,
  });

  // /agents/dynamic → /agents
  engenty.UI.registerRoute({
    id: "ai_ui_legacy_dynamic_agents_redirect",
    path: `${AGENTS_CATALOG_ROOT_PATH}/dynamic`,
    component: () => LegacyRedirect({ to: AGENTS_CATALOG_ROOT_PATH }),
    order: 231,
  });

  // /agents/dynamic/new → /agents/new
  engenty.UI.registerRoute({
    id: "ai_ui_legacy_dynamic_agents_new_redirect",
    path: `${AGENTS_CATALOG_ROOT_PATH}/dynamic/new`,
    component: () => LegacyRedirect({ to: `${AGENTS_CATALOG_ROOT_PATH}/new` }),
    order: 231.1,
  });

  // /agents/dynamic/:agentId/edit → /agents/:agentId/edit
  engenty.UI.registerRoute({
    id: "ai_ui_legacy_dynamic_agent_edit_redirect",
    path: `${AGENTS_CATALOG_ROOT_PATH}/dynamic/:agentId/edit`,
    component: () =>
      LegacyRedirect({
        to: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/edit`,
        paramKeys: ["agentId"],
      }),
    order: 231.2,
  });

  // /tools/dynamic* → /tools*
  engenty.UI.registerRoute({
    id: "ai_ui_legacy_dynamic_tools_redirect",
    path: `${AGENTS_WORKSPACE_ROOT_PATH}/tools/dynamic`,
    component: () => LegacyRedirect({ to: TOOLS_ROOT_PATH }),
    order: 232,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_legacy_dynamic_tools_new_redirect",
    path: `${AGENTS_WORKSPACE_ROOT_PATH}/tools/dynamic/new`,
    component: () => LegacyRedirect({ to: `${TOOLS_ROOT_PATH}/new` }),
    order: 232.1,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_legacy_dynamic_tools_edit_redirect",
    path: `${AGENTS_WORKSPACE_ROOT_PATH}/tools/dynamic/:toolId/edit`,
    component: () =>
      LegacyRedirect({
        to: `${TOOLS_ROOT_PATH}/:toolId/edit`,
        paramKeys: ["toolId"],
      }),
    order: 232.2,
  });

  // /admin/engenty/:agentId* → /admin/engenty/agents/:agentId*
  // Only fires for non-reserved first segments (reserved = static routes above).
  engenty.UI.registerRoute({
    id: "ai_ui_legacy_agent_catchall_redirect",
    path: `${AGENTS_WORKSPACE_ROOT_PATH}/:legacyAgentId`,
    component: () =>
      LegacyRedirect({
        to: `${AGENTS_CATALOG_ROOT_PATH}/:legacyAgentId`,
        paramKeys: ["legacyAgentId"],
        reservedGuard: RESERVED_SECTIONS,
      }),
    order: 299,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_legacy_agent_catchall_sub_redirect",
    path: `${AGENTS_WORKSPACE_ROOT_PATH}/:legacyAgentId/*`,
    component: () =>
      LegacyRedirect({
        to: `${AGENTS_CATALOG_ROOT_PATH}/:legacyAgentId`,
        paramKeys: ["legacyAgentId"],
        reservedGuard: RESERVED_SECTIONS,
        appendSplat: true,
      }),
    order: 299.1,
  });

  // ── Admin menu (bottom rail; first via app-shell ADMIN_MENU_SORT_RANK_BY_ID)

  engenty.UI.registerAdminMenuItem({
    id: "ai_ui_admin_menu",
    section: "admin",
    label: "Engenty",
    labelKey: "ai-ui:menu.engenty",
    to: AGENTS_WORKSPACE_ROOT_PATH,
    icon: DockEngentyIcon,
    order: 100,
  });
}
