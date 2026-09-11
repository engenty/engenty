import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildAgentsCatalogPath,
  buildArtifactsPath,
  buildSkillsCatalogPath,
  buildToolsPath,
  buildWorkflowsCatalogPath,
} from "./agent-workspace-paths.js";
import type { EngentyListTab } from "./engenty-list-sub-nav.js";

/** Navigate between Engenty catalog hubs when header tabs change. */
export function useEngentyListTabNavigation() {
  const navigate = useNavigate();

  return useCallback(
    (value: string) => {
      const tab = value as EngentyListTab;
      if (tab === "skills") {
        navigate(buildSkillsCatalogPath());
        return;
      }
      if (tab === "flows") {
        navigate(buildWorkflowsCatalogPath());
        return;
      }
      if (tab === "tools") {
        navigate(buildToolsPath());
        return;
      }
      if (tab === "artifacts") {
        navigate(buildArtifactsPath());
        return;
      }
      navigate(buildAgentsCatalogPath());
    },
    [navigate]
  );
}
