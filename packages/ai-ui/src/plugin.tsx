import "@engenty/tiptap-editor/styles.css";
import { DockEngentyIcon } from "@engenty/ui-icons";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import {
  ACTIVITY_ROOT_PATH,
  AGENTS_CATALOG_ROOT_PATH,
  AGENTS_WORKSPACE_ROOT_PATH,
  ARTIFACTS_ROOT_PATH,
  SKILLS_CATALOG_ROOT_PATH,
  TOOLS_ROOT_PATH,
  WORKFLOWS_CATALOG_ROOT_PATH,
} from "./features/agents-workspace/agent-workspace-paths.js";
import { ComputersPage } from "./features/computers/computers-page.js";
import { ActivityPage } from "./routes/activity-page.js";
import { AgentDetailPage } from "./routes/agent-detail-page.js";
import { AgentFormPage } from "./routes/agent-form-page.js";
import { AgentsCatalogPage } from "./routes/agents-catalog-page.js";
import { ArtifactsCatalogPage } from "./routes/artifacts-catalog-page.js";
import { ArtifactsDetailPage } from "./routes/artifacts-detail-page.js";
import { OverviewPage } from "./routes/overview-page.js";
import { SkillDetailPage } from "./routes/skill-detail-page.js";
import { SkillsCatalogPage } from "./routes/skills-catalog-page.js";
import { ToolFormPage } from "./routes/tool-form-page.js";
import { ToolsCatalogPage } from "./routes/tools-catalog-page.js";
import { WorkflowDetailRouter } from "./routes/workflow-detail-router.js";
import { WorkflowLibraryPage } from "./routes/workflow-library-page.js";

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
    id: "ai_ui_admin_agents_memory",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/memory`,
    component: AgentDetailPage,
    order: 204,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_agents_files",
    path: `${AGENTS_CATALOG_ROOT_PATH}/:agentId/files`,
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

  // ── Computers — every live sandbox, listed and killable (compute rule 5) ──

  engenty.UI.registerRoute({
    id: "ai_ui_admin_computers",
    path: `${AGENTS_WORKSPACE_ROOT_PATH}/computers`,
    component: ComputersPage,
    order: 216,
  });

  // ── Actions — the one list of everything this workspace can run ───────────
  //
  // An Action holds the input parameters and is what a button, a slash
  // command, a routine or an agent calls. Its steps are one agent turn or a
  // whole graph — a SHAPE, not a second species, so there is no second
  // catalog and no second URL space. `/actions/:id` takes either id the
  // catalog produces (a declared module-workflow id, or a stored graph uuid) and
  // the router picks the right view.

  engenty.UI.registerRoute({
    id: "ai_ui_admin_actions",
    path: WORKFLOWS_CATALOG_ROOT_PATH,
    component: WorkflowLibraryPage,
    order: 220,
  });

  engenty.UI.registerRoute({
    id: "ai_ui_admin_actions_detail",
    path: `${WORKFLOWS_CATALOG_ROOT_PATH}/:workflowId`,
    component: WorkflowDetailRouter,
    order: 220.5,
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
