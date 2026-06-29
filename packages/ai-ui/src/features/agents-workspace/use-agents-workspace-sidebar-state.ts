// Manages primary tab state for AgentsWorkspaceSidebar.

import { useState } from "react";
import {
  type WorkspaceNavPrimaryTab,
  workspaceNavPrimaryTabFromPathname,
} from "./workspace-nav-utils";

export function useAgentsWorkspaceSidebarState(pathname: string) {
  const [primaryTab, setPrimaryTab] = useState<WorkspaceNavPrimaryTab>(() =>
    workspaceNavPrimaryTabFromPathname(pathname)
  );

  return { primaryTab, setPrimaryTab };
}
