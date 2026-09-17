/**
 * How a module operation may appear on the MCP tool surface.
 *
 * `default` — catalog meta-tools can execute it; a direct named tool is
 * projected only when the OAuth client is granted that module.
 * `explicit_grant` — reachable only as a direct named tool after an explicit
 * module grant (never via the open catalog execute path for ungranted modules).
 * `never` — excluded from MCP entirely (control-plane, credential minting,
 * impersonation, plugin install, queue administration).
 */
export const MCP_DISPOSITIONS = ["default", "explicit_grant", "never"] as const;

export type McpDisposition = (typeof MCP_DISPOSITIONS)[number];

export interface McpSafeAnnotations {
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  readOnlyHint?: boolean;
}

const NEVER_OPERATION_PATTERN =
  /(impersonat|mint_token|token_mint|plugin_install|plugin_uninstall|queue_admin|service_credential|api_token_create)/i;

export function isMcpDisposition(value: unknown): value is McpDisposition {
  return value === "default" || value === "explicit_grant" || value === "never";
}

/**
 * Conservative default when an operation has not declared `mcpDisposition`.
 * Writes, high-risk, and approval-gated operations require an explicit grant;
 * known control-plane ids are excluded; everything else is catalog-eligible.
 */
export function inferMcpDisposition(operation: {
  idempotent?: boolean;
  operationId: string;
  requiresApproval?: boolean;
  riskLevel?: string;
}): McpDisposition {
  if (NEVER_OPERATION_PATTERN.test(operation.operationId)) {
    return "never";
  }
  if (
    operation.requiresApproval ||
    operation.riskLevel === "high" ||
    operation.riskLevel === "critical" ||
    operation.idempotent === false
  ) {
    return "explicit_grant";
  }
  return "default";
}

export function resolveMcpDisposition(operation: {
  idempotent?: boolean;
  mcpDisposition?: McpDisposition;
  operationId: string;
  requiresApproval?: boolean;
  riskLevel?: string;
}): { declared: boolean; disposition: McpDisposition } {
  if (isMcpDisposition(operation.mcpDisposition)) {
    return { declared: true, disposition: operation.mcpDisposition };
  }
  return {
    declared: false,
    disposition: inferMcpDisposition(operation),
  };
}
