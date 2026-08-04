import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";

export function useBrowserBridgeSettingsAgentUiSlice(input?: {
  linked?: boolean;
  online?: boolean;
}) {
  const slice = useMemo(() => {
    const linked = input?.linked === true;
    const online = input?.online === true;
    const status = linked
      ? online
        ? "extension linked and online"
        : "extension linked but offline"
      : "extension not linked";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Browser bridge",
          page_description: `Browser bridge settings (${status}). Link a browser extension and manage the origin allowlist for agent-driven browsing.`,
        }),
        bridge_linked: linked,
        bridge_online: online,
      },
    };
  }, [input?.linked, input?.online]);

  useRegisterAgentUiSlice("browser-bridge.settings", slice);
}
