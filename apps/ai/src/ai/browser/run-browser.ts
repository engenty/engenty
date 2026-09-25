// Which browser a run may drive, and with which standing consents
// (PLAN-user-browser.md §2.2, D3; PLAN-space-owned-connections.md). The
// browser is the run's SPACE's — one per Space, shared logins — and the run
// drives its agent's own window in it — the copilot's too, in the Space the
// person stands in. The Space's consents ride the surface the run already
// fetched. A run with no Space has no browser.

export interface RunBrowser {
  /** The agent whose window this run drives. */
  agentId: string;
  autostart: boolean;
  spaceId: string;
  unattended: boolean;
}

/** Where the run stands: the shape both a run-space resolution and a gate context reduce to. */
export type RunBrowserSource =
  | { kind: "global" }
  | {
      kind: "resolved";
      space: {
        browser?: { autostart?: boolean; unattended?: boolean } | null;
        spaceId: string;
      };
    }
  | { kind: "unresolved" };

/**
 * The Space browser window this run may drive, or null when the run has no
 * Space (nothing is widened for a run that has no surface) or names no agent.
 */
export function resolveRunBrowser(input: {
  agentId: string | null | undefined;
  source: RunBrowserSource;
}): RunBrowser | null {
  const agentId = input.agentId?.trim();
  if (input.source.kind !== "resolved" || !agentId) {
    return null;
  }
  const grant = input.source.space.browser;
  return {
    agentId,
    autostart: grant?.autostart === true,
    spaceId: input.source.space.spaceId,
    unattended: grant?.unattended === true,
  };
}
