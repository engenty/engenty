/**
 * agent-workspace-url-state.ts — thin re-export shim.
 *
 * All path constants and builders live in agent-workspace-paths.ts.
 * This module re-exports them so that existing imports continue to work
 * without change during the Batch 1 migration.
 */

export {
  ACTIONS_CATALOG_ROOT_PATH,
  ACTIVITY_ROOT_PATH,
  AGENTS_CATALOG_ROOT_PATH,
  AGENTS_WORKSPACE_ROOT_PATH,
  buildActionDetailPath,
  buildActionsCatalogPath,
  buildActivityPath,
  buildAgentActivityPath,
  buildAgentCapabilitiesPath,
  buildAgentCreatePath,
  buildAgentDetailPath,
  buildAgentEditPath,
  buildAgentInstructionsPath,
  buildAgentSessionDetailPath,
  buildAgentSessionsPath,
  buildAgentsCatalogPath,
  buildAgentsWorkspacePath,
  buildAgentWorkspacePath,
  buildConnectionDetailPath,
  buildConnectionsPath,
  buildSkillDetailPath,
  buildSkillsCatalogPath,
  buildToolCreatePath,
  buildToolEditPath,
  buildToolsPath,
  CONNECTIONS_ROOT_PATH,
  SKILLS_CATALOG_ROOT_PATH,
  TOOLS_ROOT_PATH,
  withWorkspaceParam,
} from "./agent-workspace-paths";

export type { AgentsWorkspaceSection } from "./agent-workspace-url-state-parsers";
export {
  parseAgentSessionDetailFromPathname,
  parseAgentsWorkspaceSection,
} from "./agent-workspace-url-state-parsers";
