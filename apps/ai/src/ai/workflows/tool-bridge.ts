// Run a builtin agent tool from inside a graph node.
//
// The two sides read their identity from different places: an agent tool reads
// the engenty-tools ALS, a graph primitive reads `requestContext`. This is the
// one bridge between them, so a node and an agent call reach the same tool with
// the same tenant, Space and credential.
//
// A scheduled fire executes with NO ambient engenty-tools context, which is why
// the bridge builds one rather than inheriting: an HTTP-triggered run used to
// borrow the caller's, which masked exactly this gap for every manual fire.
import {
  type EngentyToolsRunContext,
  engentyToolsRunAls,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import { serviceScopeTokenRefresher } from "../service-credential.js";
import { type AiSessionScope, scopeAccessToken } from "../sessions/types.js";
import { resolveGraphToolSpace } from "./primitives/engenty-tool.js";
import type { GraphRunContext } from "./run-context.js";

export interface GraphToolsAlsOptions {
  /**
   * Attribution for writes the node authors. A node has no agent, so this is
   * null by default — and that is load-bearing for artifacts, whose write scope
   * promotes to the Space when an agent key is set. A node's artifact stays on
   * its thread unless the graph names `store_to`.
   */
  agentTypeKey?: string | null;
}

/**
 * The engenty-tools context for this graph run, with the token-refresh seam
 * installed — a graph step can outlive the 15-minute service token it started
 * on, and the refresher re-mints on a core 401.
 */
export function graphToolsContext(
  runCtx: GraphRunContext,
  scope: AiSessionScope,
  options: GraphToolsAlsOptions = {}
): EngentyToolsRunContext {
  const context: EngentyToolsRunContext = {
    accessToken: scopeAccessToken(scope),
    agentTypeKey: options.agentTypeKey ?? null,
    space: resolveGraphToolSpace(runCtx.space),
    tenantId: runCtx.tenantId,
    // Where a tool that writes "into the chat" writes. The run's own thread —
    // the card carriage picks its own destination separately.
    userFacingThreadId: runCtx.threadId,
    userId: scope.userId,
  };
  const refresher = serviceScopeTokenRefresher(scope);
  if (refresher) {
    context.refreshAccessToken = async () => {
      const fresh = await refresher();
      if (fresh) {
        context.accessToken = fresh;
      }
      return fresh;
    };
  }
  return context;
}

/** Run `fn` with this graph run's engenty-tools context in scope. */
export function withGraphToolsAls<T>(
  runCtx: GraphRunContext,
  scope: AiSessionScope,
  fn: () => Promise<T>,
  options?: GraphToolsAlsOptions
): Promise<T> {
  return engentyToolsRunAls.run(graphToolsContext(runCtx, scope, options), fn);
}
