import {
  isEngentyDeveloperModeUiEnabled,
  subscribeDeveloperModePreference,
} from "@engenty/environment";
import { useEffect, useState } from "react";
import { useWorkspaceContextQuery } from "@/lib/workspace-context-query";

/**
 * Reactive developer-mode UI flag: dev ENV + user-menu toggle, gated to
 * superadmins. A member who flips the localStorage key gets nothing — the
 * developer surfaces (inspector tab, /settings/development, feature flags) all
 * hang off this hook, so the superadmin gate here is the single choke point.
 */
export function useDeveloperModeEnabled() {
  const [enabled, setEnabled] = useState(isEngentyDeveloperModeUiEnabled);
  const workspace = useWorkspaceContextQuery(true);
  const isSuperAdmin = workspace.data?.isSuperAdmin === true;

  useEffect(
    () =>
      subscribeDeveloperModePreference(() => {
        setEnabled(isEngentyDeveloperModeUiEnabled());
      }),
    []
  );

  return enabled && isSuperAdmin;
}
