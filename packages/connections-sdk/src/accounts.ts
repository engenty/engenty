import type { ConnectionSummary } from "./types.js";

/** Account-facing label for one candidate connection (agent discovery). */
export interface ConnectionAccountLabel {
  account: string | null;
  connection_id: string;
  display_name: string | null;
}

export function connectionAccountLabel(
  connection: ConnectionSummary
): ConnectionAccountLabel {
  return {
    account: connection.external_account,
    connection_id: connection.id,
    display_name: connection.display_name,
  };
}

export type ConnectionSelection =
  | { connection: ConnectionSummary; ok: true }
  | {
      candidates: ConnectionAccountLabel[];
      code:
        | "connection_account_not_found"
        | "connection_ambiguous"
        | "connection_not_connected";
      ok: false;
    };

/**
 * Pick the connection a call targets among a principal's candidates.
 *
 * - explicit `account` matches `external_account` or `display_name`
 *   (case-insensitive substring); one hit wins, several stay ambiguous
 * - no `account` + exactly one candidate → use it (single-account tenants
 *   keep the pre-multi-account behavior)
 * - no `account` + several candidates → ambiguous, with the candidate labels
 *   so the caller (agent) can self-correct or ask
 *
 * Shared by the operation handler and the profile policy gate — both must
 * resolve the SAME candidate or the policy check gates the wrong connection.
 */
export function selectConnectionForAccount(params: {
  account?: string | null;
  candidates: ConnectionSummary[];
}): ConnectionSelection {
  const { candidates } = params;
  const account = params.account?.trim().toLowerCase();
  if (candidates.length === 0) {
    return { candidates: [], code: "connection_not_connected", ok: false };
  }
  if (!account) {
    if (candidates.length === 1) {
      return { connection: candidates[0], ok: true };
    }
    return {
      candidates: candidates.map(connectionAccountLabel),
      code: "connection_ambiguous",
      ok: false,
    };
  }
  const matches = candidates.filter((c) =>
    [c.external_account, c.display_name].some((label) =>
      label?.toLowerCase().includes(account)
    )
  );
  if (matches.length === 1) {
    return { connection: matches[0], ok: true };
  }
  if (matches.length === 0) {
    return {
      candidates: candidates.map(connectionAccountLabel),
      code: "connection_account_not_found",
      ok: false,
    };
  }
  return {
    candidates: matches.map(connectionAccountLabel),
    code: "connection_ambiguous",
    ok: false,
  };
}

/** Human/agent-readable message for a failed selection (shared wording). */
export function describeSelectionFailure(
  selection: Extract<ConnectionSelection, { ok: false }>,
  connectorName: string
): string {
  const list = selection.candidates
    .map((c) => c.display_name ?? c.account ?? c.connection_id)
    .join(", ");
  switch (selection.code) {
    case "connection_not_connected":
      return `no active ${connectorName} connection for this account. Connect it under Settings → Connections.`;
    case "connection_account_not_found":
      return `no connected ${connectorName} account matches the given "account". Connected accounts: ${list}.`;
    default:
      return `several ${connectorName} accounts are connected — pass "account" to pick one of: ${list}.`;
  }
}
