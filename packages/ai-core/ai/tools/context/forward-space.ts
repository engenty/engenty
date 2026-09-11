import type { ToolExecutionContext } from "./types.js";

type GatewayCaller = NonNullable<ToolExecutionContext["callGatewayMethod"]>;

/**
 * Forward the run's Space on every gateway call so core's operation policy
 * sees the same `spaceId` / confinement the tool was assembled with.
 *
 * Existing `opts.auth` wins on key clash — a caller that already named a Space
 * is being explicit, and this wrapper must not silently replace it. Assembly
 * still populates {@link ToolExecutionContext.spaceId} so a call that omits
 * `opts` is not tenant-global by accident.
 */
export function forwardSpaceOnGatewayCall(
  ctx: Pick<
    ToolExecutionContext,
    "callGatewayMethod" | "spaceConfined" | "spaceId"
  >
): GatewayCaller | undefined {
  const call = ctx.callGatewayMethod;
  if (!call) {
    return;
  }
  return (name, input, opts) => {
    // Read at call time so ALS getters (and later-bound context) are not
    // snapshotted as tenant-global at tool assembly.
    const spaceId = ctx.spaceId?.trim() || null;
    const spaceConfined = ctx.spaceConfined === true;
    if (!(spaceId || spaceConfined)) {
      return opts === undefined ? call(name, input) : call(name, input, opts);
    }
    const priorAuth =
      opts?.auth && typeof opts.auth === "object" && !Array.isArray(opts.auth)
        ? (opts.auth as Record<string, unknown>)
        : {};
    return call(name, input, {
      ...opts,
      auth: {
        ...(spaceId ? { spaceId } : {}),
        ...(spaceConfined ? { spaceConfined: true } : {}),
        ...priorAuth,
      },
    });
  };
}
