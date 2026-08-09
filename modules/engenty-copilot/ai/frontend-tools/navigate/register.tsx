import type { JsonValue } from "@engenty/ag-ui-bridge";
import { useEngentyFrontendTool } from "@engenty/ai-ui";
import type { AgentUiFrontendToolHandler } from "@engenty/app-shell";
import { useUiContributions } from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo } from "react";
import { matchPath, useNavigate } from "react-router-dom";
import { NAVIGATE_SPEC } from "./definition.js";
import {
  type NavigateFrontendToolResult,
  type NavigateRouteTable,
  runNavigateFrontendTool,
} from "./run.js";

/** Optional fields make the result structurally un-assignable to JsonValue. */
function asJson(result: NavigateFrontendToolResult): JsonValue {
  return result as unknown as JsonValue;
}

/**
 * The routes the app can actually render — the same contribution list
 * `AuthenticatedRoutes` builds its `<Route>` tree from. Route paths live in each
 * module's `ui/plugin.ts` and never reach the server, so this is the only place
 * that knows them.
 */
function useNavigateRouteTable(): NavigateRouteTable | undefined {
  const { contributions, ready } = useUiContributions();
  const patterns = useMemo(
    () => contributions.routes.map((route) => route.path),
    [contributions.routes]
  );
  return useMemo(
    () =>
      ready && patterns.length > 0
        ? {
            // React Router's own matcher, so this agrees with what navigation
            // actually does.
            matches: (pattern, pathname) =>
              matchPath({ end: true, path: pattern }, pathname) !== null,
            patterns,
          }
        : undefined,
    [patterns, ready]
  );
}

export function useNavigateFrontendToolExecutor(): AgentUiFrontendToolHandler {
  const navigate = useNavigate();
  const routes = useNavigateRouteTable();
  return useCallback(
    (input, _request) =>
      asJson(runNavigateFrontendTool(input, navigate, { routes })),
    [navigate, routes]
  );
}

export function useRegisterNavigateFrontendTool(options?: {
  openCopilotShell?: () => void;
}): void {
  const navigate = useNavigate();
  const routes = useNavigateRouteTable();
  // run.js stays the execution authority (internal-path security checks); the zod
  // schema only types the args the agent sees.
  useEngentyFrontendTool({
    ...NAVIGATE_SPEC,
    handler: (input) =>
      asJson(
        runNavigateFrontendTool(input, navigate, {
          onNavigate: () => options?.openCopilotShell?.(),
          routes,
        })
      ),
  });
}
