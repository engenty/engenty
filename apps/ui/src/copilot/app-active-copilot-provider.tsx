// Shell-level wrapper that mounts the copilot river so the routed page tree
// (`/copilot`, `/s/<key>/copilot`) and the companion (drawer / sidebar /
// window) resolve the same host from the same provider.
//
// The path is NOT read here. This provider wraps the app; subscribing to the
// router would re-render it on every space switch. `CopilotRiverLocationSync`
// stamps the turn from under the location frame.

import {
  CopilotRiverProvider,
  resolveEngentyAiServiceBaseUrl,
} from "@engenty/ai-ui";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export interface AppActiveCopilotProviderProps {
  children: ReactNode;
  tenantId: string;
  userId: string;
}

const INITIAL_ROUTE = {
  moduleId: "engenty-copilot",
  pathname: "/",
  routeKey: "chat",
  scope: {},
} as const;

export function AppActiveCopilotProvider(props: AppActiveCopilotProviderProps) {
  const navigate = useNavigate();
  const routeContext = useMemo(() => ({ ...INITIAL_ROUTE }), []);

  // Read for its side effect of validating configuration early, the way the
  // provider before it did; the river client reads the base URL itself.
  void resolveEngentyAiServiceBaseUrl();

  return (
    <CopilotRiverProvider
      navigate={navigate}
      pathname={INITIAL_ROUTE.pathname}
      routeContext={routeContext}
      tenantId={props.tenantId}
      userId={props.userId}
    >
      {props.children}
    </CopilotRiverProvider>
  );
}
