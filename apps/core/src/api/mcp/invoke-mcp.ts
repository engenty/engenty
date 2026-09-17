import type { createApprovalService } from "@engenty/approvals-sdk";
import {
  acceptedContent,
  type CallToolResult,
  CLIENT_CAPABILITIES_META_KEY,
  type InputRequiredResult,
  inputRequired,
  MCP_APPS_EXTENSION,
  MCP_TASKS_EXTENSION,
  type ServerContext,
} from "@engenty/mcp-server";
import { uuidv7 } from "uuidv7";
import type { PluginRegistry } from "../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../security/audit-adapter.js";
import type { PrincipalContext } from "../../security/auth.js";
import { getSecuritySecret } from "../../security/auth.js";
import type { PolicyDeps } from "../../security/policy.js";
import type { OperationContract } from "../operation-contracts.js";
import { invokeOperation } from "../routes/plugins/module-operation-invoke.js";
import {
  InvokeOperationError,
  isApprovalRequiredBody,
} from "../routes/plugins/module-operation-shared.js";
import {
  mintMrtrPayload,
  mrtrRequestState,
  parseMrtrRequestState,
  verifyMrtrPayload,
} from "./approvals-mrtr.js";
import { hashMcpArguments } from "./audience.js";
import type { McpAuthorityResolver } from "./authority.js";
import type { McpClientGrant } from "./grants.js";
import type { McpTaskStore } from "./tasks.js";
import { truncateStructuredContent } from "./tools.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

export interface McpInvokeRuntime {
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  authority: McpAuthorityResolver;
  config: Record<string, unknown>;
  dataDir: string;
  registry: PluginRegistry;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
  resolvePath: (p: string) => string;
  tasks: McpTaskStore;
}

/**
 * Always embed the payload as JSON in `content[].text`.
 *
 * Cursor (and similar hosts) advertise MCP Apps and then prefer
 * `structuredContent` over text — but display it via `String(value)`, which
 * becomes `[object Object]`. Only attach `structuredContent` + `resourceUri`
 * when a real MCP App widget will consume them.
 */
export function textResult(
  summary: string,
  structured: unknown,
  resourceUri?: string
): CallToolResult {
  const truncated = truncateStructuredContent(structured);
  const json = JSON.stringify(truncated, null, 2);
  const head = summary.trim();
  const content = [
    {
      type: "text" as const,
      text: head ? `${head}\n${json}` : json,
    },
  ];
  if (!resourceUri) {
    return { content };
  }
  const structuredContent =
    truncated !== null &&
    typeof truncated === "object" &&
    !Array.isArray(truncated)
      ? (truncated as Record<string, unknown>)
      : { result: truncated };
  return {
    content,
    structuredContent,
    _meta: { ui: { resourceUri } },
  };
}

export function clientAdvertisesExtension(
  ctx: ServerContext | undefined,
  extension: string
): boolean {
  const envelope = ctx?.mcpReq.envelope as Record<string, unknown> | undefined;
  const fromKey = envelope?.[CLIENT_CAPABILITIES_META_KEY] as
    | { experimental?: Record<string, unknown> }
    | undefined;
  const experimental =
    fromKey?.experimental ??
    (
      envelope as
        | { clientCapabilities?: { experimental?: Record<string, unknown> } }
        | undefined
    )?.clientCapabilities?.experimental;
  return Boolean(experimental?.[extension]);
}

function asThrownError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(typeof error === "string" ? error : JSON.stringify(error));
}

export async function invokeMcpOperation(params: {
  arguments: unknown;
  ctx?: ServerContext;
  grant: McpClientGrant;
  operationId: string;
  principal: PrincipalContext;
  requestState?: string;
  spaceId?: string;
  runtime: McpInvokeRuntime;
  contract: OperationContract;
}): Promise<CallToolResult | InputRequiredResult> {
  const { contract, runtime } = params;
  const principal = await runtime.authority.resolve(
    params.grant,
    params.principal,
    params.spaceId
  );
  const secret = getSecuritySecret(runtime.config);
  const requestState =
    params.requestState ?? params.ctx?.mcpReq.requestState<string>();
  if (requestState) {
    const payload = parseMrtrRequestState(requestState, secret);
    if (!payload) {
      throw new Error("invalid_request_state");
    }
    const verified = verifyMrtrPayload({
      arguments: params.arguments,
      clientId: principal.clientId ?? "",
      operationId: params.operationId,
      payload,
      principal,
    });
    if (!verified.ok) {
      throw new Error(verified.reason);
    }
    const decision = acceptedContent<{ decision?: string }>(
      params.ctx?.mcpReq.inputResponses,
      "approval"
    );
    if (decision?.decision !== "allow_once" && decision?.decision !== "deny") {
      throw new Error("mcp_approval_decision_required");
    }
    const decided = await runtime.approvalService.decide({
      decidedBy: principal.actingForUserId ?? principal.principalId,
      decision: decision.decision,
      requestId: payload.approvalRequestId,
      tenantId: principal.tenantId,
    });
    if (!decided || decided.id !== payload.approvalRequestId) {
      throw new Error("mcp_approval_not_found");
    }
    if (decision.decision === "deny") {
      throw new Error("mcp_approval_denied");
    }
  }
  // Only bind an App widget when the operation declared one. Attaching the
  // default result widget for every call makes hosts like Cursor prefer
  // `structuredContent` and render it as `[object Object]`.
  const resourceUri = clientAdvertisesExtension(params.ctx, MCP_APPS_EXTENSION)
    ? contract.mcp.appResourceUri
    : undefined;
  if (
    contract.mcp.taskCapable &&
    clientAdvertisesExtension(params.ctx, MCP_TASKS_EXTENSION)
  ) {
    const id = `tsk_${uuidv7()}`;
    const record = await runtime.tasks.create({
      clientId: principal.clientId ?? "",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      id,
      inputHash: hashMcpArguments(params.arguments),
      operationId: params.operationId,
      status: "working",
      tenantId: principal.tenantId,
      updatedAt: new Date().toISOString(),
      userId: principal.actingForUserId ?? principal.principalId,
      spaceId: principal.spaceId,
    });
    void invokeOperation({
      approvalService: runtime.approvalService,
      auditLog: runtime.auditLog,
      auth: principal,
      config: runtime.config,
      dataDir: runtime.dataDir,
      input: params.arguments,
      operationId: params.operationId,
      registry: runtime.registry,
      resolvePath: runtime.resolvePath,
      transport: "mcp",
      ...(runtime.resolveAgentApproval
        ? { resolveAgentApproval: runtime.resolveAgentApproval }
        : {}),
    })
      .then(async ({ data }) => {
        await runtime.tasks.update(record.id, {
          result: data,
          status: "completed",
        });
      })
      .catch(async (error) => {
        await runtime.tasks.update(record.id, {
          error: error instanceof Error ? error.message : String(error),
          status: "failed",
        });
      });
    return {
      content: [
        {
          type: "text" as const,
          text: `Task ${record.id} started for ${params.operationId}.`,
        },
      ],
      structuredContent: {
        resultType: "task",
        task: { status: "working", taskId: record.id },
      },
    };
  }
  try {
    const { data } = await invokeOperation({
      approvalService: runtime.approvalService,
      auditLog: runtime.auditLog,
      auth: principal,
      config: runtime.config,
      dataDir: runtime.dataDir,
      input: params.arguments,
      operationId: params.operationId,
      registry: runtime.registry,
      resolvePath: runtime.resolvePath,
      transport: "mcp",
      ...(runtime.resolveAgentApproval
        ? { resolveAgentApproval: runtime.resolveAgentApproval }
        : {}),
    });
    return textResult(`Completed ${params.operationId}.`, data, resourceUri);
  } catch (error) {
    if (error instanceof InvokeOperationError && error.status === 202) {
      // The pipeline names this `approvalRequestId`; reading an untyped
      // `requestId` off the body silently bound every retry to an empty id.
      if (!isApprovalRequiredBody(error.body)) {
        throw error;
      }
      const payload = mintMrtrPayload({
        approvalRequestId: error.body.approvalRequestId,
        arguments: params.arguments,
        clientId: principal.clientId ?? "",
        operationId: params.operationId,
        principal,
      });
      return inputRequired({
        inputRequests: {
          approval: inputRequired.elicit({
            message: error.message,
            requestedSchema: {
              type: "object",
              properties: {
                decision: {
                  type: "string",
                  enum: ["allow_once", "deny"],
                },
              },
              required: ["decision"],
            },
          }),
        },
        requestState: mrtrRequestState(payload, secret),
      });
    }
    throw asThrownError(error);
  }
}
