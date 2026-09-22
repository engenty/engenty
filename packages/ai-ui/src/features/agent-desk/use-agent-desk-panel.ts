// The settings / runs pane's URL state, shared by every desk: `?panel=` is
// the pane, and the keys a routine or run inside it adds go with it on close.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AGENT_DESK_PANEL_STATE_KEYS,
  type AgentDeskPanel,
  parseAgentDeskPanel,
} from "./agent-desk-drawer.js";

export function useAgentDeskPanel(): {
  closePanel: () => void;
  openPanel: (panel: AgentDeskPanel) => void;
  panel: AgentDeskPanel | null;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  // `tab` is the name the panel carried before the drawer; it resolves the
  // same way.
  const panel = parseAgentDeskPanel(
    searchParams.get("panel") ?? searchParams.get("tab")
  );
  const openPanel = useCallback(
    (next: AgentDeskPanel) => {
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.set("panel", next);
        params.delete("tab");
        return params;
      });
    },
    [setSearchParams]
  );
  const closePanel = useCallback(() => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete("panel");
      params.delete("tab");
      for (const key of AGENT_DESK_PANEL_STATE_KEYS) {
        params.delete(key);
      }
      return params;
    });
  }, [setSearchParams]);
  return { closePanel, openPanel, panel };
}
