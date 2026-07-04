export type ConnectionsActionErrorCode =
  | "connection_account_not_found"
  | "connection_ambiguous"
  | "connection_approval_pending"
  | "connection_denied"
  | "connection_not_connected"
  | "connection_stream_unsupported";

/**
 * Typed error for connector-action execution. The message always starts with
 * the machine-readable code (`<code>: <human text>`) so both agents (tool
 * error strings) and module code (`error.code`) can branch on it.
 */
export class ConnectionsActionError extends Error {
  readonly code: ConnectionsActionErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: ConnectionsActionErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(`${code}: ${message}`);
    this.name = "ConnectionsActionError";
    this.code = code;
    this.details = details;
  }
}
