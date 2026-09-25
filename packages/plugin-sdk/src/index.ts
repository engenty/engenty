/**
 * Engenty Plugin SDK
 *
 * Types and helpers for plugin authors. See dev/plans/plugin-system.md §6.
 */

import type { FeatureFlagDefinition as _FeatureFlagDefinition } from "@engenty/feature-flags";
import type { McpDisposition, McpSafeAnnotations } from "./mcp-disposition.js";
import type { PluginCategory, PluginStability } from "./plugin-category.js";

export type { FeatureFlagDefinition } from "@engenty/feature-flags";
export {
  AGENT_APPROVAL_MODES,
  type AgentApprovalMode,
  DEFAULT_AGENT_APPROVAL_MODES,
  parseAgentApprovalMode,
  resolveAgentApprovalMode,
  shouldAskHuman,
} from "./agent-approval-mode.js";
export {
  type AgentKind,
  canAgentOwnTrigger,
  type RoutineSource,
  type TriggerOwnerAgent,
} from "./agent-role.js";
export {
  AUTOMATION_HOOK_KB_INBOX_ITEM_CREATED,
  type AutomationHookListener,
  type AutomationHookPayload,
  emitAutomationHook,
  registerAutomationHookListener,
} from "./automation-hooks.js";
export { capabilityCovers } from "./capability-match.js";
export {
  type PluginCapabilityBlockedReason,
  type PluginCapabilityDiagnostic,
  type PluginCapabilityRecord,
  type PluginCapabilityRegistry,
  type PluginCapabilityResolution,
  type PluginContributionKind,
  type ResolvePluginCapabilityParams,
  resolvePluginCapability,
} from "./capability-resolver.js";
export {
  COMPUTER_EGRESS_HOSTS_MAX,
  COMPUTER_NETWORK_TIERS,
  type ComputerNetworkTier,
  parseComputerEgressHost,
  parseComputerNetworkTier,
} from "./computer-network-tier.js";
export type {
  ContextGraphEventBinding,
  ContextGraphHost,
  ContextGraphSchemaRegistration,
  ContextGraphSourceRegistration,
  ContextGraphSourceRegistry,
  ContextGraphSourceStatus,
  ContextGraphSyncResult,
  ContextGraphUpsertInput,
  EdgeTypeSpec,
  EntityTypeSpec,
  ExternalRef,
  PluginContextGraphServerApi,
} from "./context-graph-registration.js";
export {
  clearDefaultSpaceCache,
  resolveDefaultSpaceId,
} from "./default-space.js";
export {
  type ForeignTableRef,
  foreignSelect,
  type TenantScope,
} from "./foreign-schema.js";
export {
  inferMcpDisposition,
  isMcpDisposition,
  MCP_DISPOSITIONS,
  type McpDisposition,
  type McpSafeAnnotations,
  resolveMcpDisposition,
} from "./mcp-disposition.js";
export {
  createRecordLinker,
  moduleRecordPath,
  type RecordLinkAuth,
  type RecordLinker,
  withRecordLink,
  withRecordLinks,
} from "./record-link.js";
export {
  resolveSpaceAgentMount,
  type SpaceAgentMountClient,
  type SpaceAgentMountResolution,
} from "./space-agent-mount.js";
export {
  assertSpaceDataMemberEditable,
  assertSpaceDataVersion,
  dataConflictError,
  findSpaceDataMemberSpec,
  isSpaceDataIndexFile,
  isSpaceDataRefName,
  joinSpaceDataPath,
  matchSpaceDataNodeType,
  normalizeSpaceDataPath,
  notEditableError,
  notSupportedError,
  parseSpaceDataRef,
  SPACE_DATA_INDEX_FILES,
  SPACE_DATA_REF_EXTENSION,
  type SpaceDataAdapter,
  type SpaceDataContext,
  type SpaceDataCreateInput,
  type SpaceDataDeleteInput,
  type SpaceDataDocument,
  type SpaceDataEncoding,
  type SpaceDataEntry,
  type SpaceDataFolder,
  type SpaceDataImportResult,
  type SpaceDataListing,
  type SpaceDataMember,
  type SpaceDataMemberSpec,
  type SpaceDataMoveInput,
  type SpaceDataNodeKind,
  type SpaceDataNodeType,
  type SpaceDataRecordScope,
  type SpaceDataRef,
  type SpaceDataWriteInput,
  serializeSpaceDataRef,
  spaceDataFieldUnchanged,
  spaceDataPathSegments,
  spaceDataRefFileName,
  spaceDataRefLabel,
  spaceDataVersionOf,
  spaceDataVersionsMatch,
} from "./space-data.js";
export {
  archiveDocumentEntries,
  archiveFolderEntry,
  planSpaceDataImport,
  type SpaceDataArchive,
  type SpaceDataArchiveEntry,
  type SpaceDataArchivePlan,
} from "./space-data-archive.js";
export {
  type FrontmatterDocument,
  parseCsv,
  parseFrontmatter,
  readFolderIndex,
  SPACE_DATA_ID_SEPARATOR,
  type SpaceDataFolderIndex,
  serializeCsv,
  serializeFolderIndexMarkdown,
  serializeFrontmatter,
  spaceDataNodeName,
  spaceDataNodeRecordId,
  spaceDataSegmentLabel,
  spaceDataSlug,
} from "./space-data-format.js";
export {
  AI_SERVICE_CAPABILITIES,
  AI_SERVICE_PLAN_CAPABILITIES,
  capabilitiesForModuleAccess,
  deriveSpaceAgentCapabilities,
  MODULE_FACETS,
  type SpaceAgentAccessLevel,
  type SpaceGrantInput,
  type SpaceModuleGrantInput,
} from "./space-grants.js";
export {
  clearSpaceKeyCache,
  resolveSpaceKey,
  type SpaceKeyClient,
} from "./space-key.js";
export {
  isOperationSpacePolicy,
  isSpacePlacedPlugin,
  MISSING_SPACE_POLICY_ALLOWLIST,
  OPERATION_SPACE_POLICY_KINDS,
  type OperationRecordScope,
  type OperationSpacePolicy,
  type OperationSpacePolicyKind,
  operationSpacePolicySchema,
  recordScopeFromSpacePolicy,
  spacePlacedOperationsMissingPolicy,
} from "./space-policy.js";
export {
  getSpaceTemplate,
  hiredAgentMountKeys,
  isBaselineSpaceMount,
  type MissingMountDependency,
  type ModuleMountRequires,
  missingBaselineMounts,
  missingMountDependencies,
  moduleIdFromRequirement,
  moduleMountDependents,
  moduleMountRequiresFromPlugins,
  SPACE_AGENT_LIMIT,
  SPACE_BASELINE_MOUNTS,
  SPACE_RESOURCE_KINDS,
  SPACE_TEMPLATES,
  type SpaceMountDeclaration,
  type SpaceRecordScopeLevel,
  type SpaceResourceKind,
  type SpaceTemplate,
  spaceMountKey,
  spaceTemplateMounts,
} from "./space-setup.js";

import type { TenantScope } from "./foreign-schema.js";
import type { OperationSpacePolicy } from "./space-policy.js";

export {
  forbiddenError,
  isPluginOperationError,
  notFoundError,
  PluginOperationError,
} from "./operation-error.js";
export { ownershipPolicy } from "./ownership-policy.js";
export type {
  PluginCategory,
  PluginPlacement,
  PluginStability,
} from "./plugin-category.js";
export {
  DEFAULT_PLUGIN_PLACEMENT,
  isPluginCategory,
  isPluginPlacement,
  isPluginStability,
  PLUGIN_CATEGORIES,
  PLUGIN_PLACEMENTS,
  PLUGIN_STABILITIES,
  pluginCategoryRank,
} from "./plugin-category.js";
export {
  type CreatePluginEventsRuntimeOptions,
  createPluginEventsRuntime,
  type EntityEventName,
  type EntityEventPayload,
  type EntityEventVerb,
  PLUGIN_AGENT_EVENTS,
  PLUGIN_FRONTEND_TOOL_EVENTS,
  PLUGIN_LIFECYCLE_EVENTS,
  PLUGIN_OPERATION_EVENTS,
  type PluginAgentEventName,
  type PluginCoreEventName,
  type PluginCoreEventsApi,
  type PluginEventContext,
  type PluginEventEmitContext,
  type PluginEventFilter,
  type PluginEventHandlerRegistration,
  type PluginEventInterceptor,
  type PluginEventInterceptorDecision,
  type PluginEventListenerKind,
  type PluginEventListenerOptions,
  type PluginEventName,
  type PluginEventNamespace,
  type PluginEventObserver,
  type PluginEventPayload,
  type PluginEventRegistrationReceipt,
  type PluginEventSourceInfo,
  type PluginEventsApi,
  type PluginEventsRuntime,
  type PluginEventUnsubscribe,
  type PluginFrontendToolEventName,
  type PluginInterceptionResult,
  type PluginLifecycleEventName,
  type PluginModuleEventName,
  type PluginModuleEventsApi,
  type PluginOperationEventName,
} from "./plugin-events.js";
export {
  type RoleProfile,
  RoleProfileRegistry,
} from "./role-profiles.js";
export {
  bindSearchIndexProviderEvents,
  createSearchIndexHost,
  resolveSearchOperationId,
  synthesizeSearchOperation,
} from "./search-index-host.js";
export {
  type PluginSearchIndexRegistration,
  type PluginSearchIndexRegistrationOptions,
  SEARCH_INDEX_REFRESH_FAILED_EVENT,
  type SearchDocument,
  type SearchIndexEventBinding,
  type SearchIndexProvider,
  type SearchIndexRegistration,
  type SearchIndexRegistrationMetadata,
  type SearchIndexRegistry,
  type SearchIndexStatus,
  type SearchProviderCapabilities,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
} from "./search-index-registration.js";
export {
  assertStrictToolId,
  normalizeLegacyToolId,
  STRICT_TOOL_ID_PATTERN,
} from "./tool-id.js";

import type {
  RetrievalServiceWithProviders as RetrievalServiceLike,
  RetrievalSourceRegistration,
} from "@engenty/retrieval";
import type { SearchIndexProvider } from "@engenty/search-index";
import type { Command } from "commander";
import type { ZodType } from "zod";
import type {
  ContextGraphHost,
  ContextGraphSchemaRegistration,
  ContextGraphSourceRegistration,
  PluginContextGraphServerApi,
} from "./context-graph-registration.js";
import type { PluginEventsApi } from "./plugin-events.js";
import type { RoleProfile } from "./role-profiles.js";
import type { PluginSearchIndexRegistrationOptions } from "./search-index-registration.js";
import type { SpaceDataAdapter } from "./space-data.js";

/** Context passed to CLI registrars when they add subcommands. */
export interface CliContext {
  config: Record<string, unknown>;
  dataDir?: string;
  program: Command;
  resolvePath: (p: string) => string;
}

/** Function that registers CLI subcommands. opts.commands lists the command names registered. */
export type CliRegistrar = (ctx: CliContext) => void | Promise<void>;

export interface PluginLogger {
  debug: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
}

export interface PluginServiceContext {
  config: Record<string, unknown>;
  dataDir?: string;
  logger: PluginLogger;
  pluginConfig: Record<string, unknown>;
  resolvePath: (p: string) => string;
}

export interface PluginService {
  id: string;
  /**
   * Services are treated as reloadable only when they expose a stop handler and
   * do not opt out. Non-reloadable services force a restart during dev reload.
   */
  reloadable?: boolean;
  start: (ctx: PluginServiceContext) => void | Promise<void>;
  stop?: (ctx: PluginServiceContext) => void | Promise<void>;
}

export type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head";

export interface PluginHttpRequestSchemas {
  body?: ZodType;
  headers?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export interface PluginHttpResponseSpec {
  description?: string;
  schema?: ZodType;
}

export type PluginHttpResponseMode = "json" | "binary" | "stream" | "empty";

export interface PluginAuthContext {
  /**
   * core.agents uuid of the AI agent driving this call (from the
   * x-engenty-agent-id header), when an agent — not the user directly — is
   * acting. Handlers use it for audit attribution; authorization decisions on
   * it belong in operation policies, which see the same value.
   */
  agentId?: string;
  /**
   * The principal's effective capability strings. Populated by the core HTTP
   * operation host from the resolved principal so module handlers can make
   * capability-based visibility decisions (e.g. a moderator seeing all rows).
   * Optional because in-process gateway callers may omit it — read it as
   * `capabilities ?? []` (absent ⇒ no elevated visibility, the safe default).
   */
  capabilities?: string[];
  /** Goal the agent is pursuing (x-engenty-goal-id); pairs with agentId. */
  goalId?: string;
  principalId: string;
  /**
   * What kind of principal `principalId` names: a core.users id ("user"), a
   * core.service_credential id ("service"), or a core.agents id ("agent").
   * Absent means "user" — the assumption every caller made before service
   * principals existed. Handlers must not write `principalId` into a
   * user-FK column without checking this; use `actorUserIdFromAuth`.
   */
  principalType?: "user" | "agent" | "service";
  scopeId: string;
  /**
   * The space this call happens in (x-engenty-space-id), when the caller named
   * one — PLAN-spaces.md Phase CN.3.
   *
   * For handlers that LIST things a space contains, so a page inside a space
   * shows that space's accounts rather than the tenant's. Narrowing only: a
   * handler must filter what the principal may already see, never widen it on
   * the strength of this value. Absent means "no narrowing".
   */
  spaceId?: string;
  /**
   * The task a headless run executes (x-engenty-task-id). An UNVERIFIED claim
   * on its own, like `triggerId` below.
   */
  taskId?: string;
  tenantId: string;
  /**
   * The routine (trigger) a headless run executes for (x-engenty-trigger-id).
   * An UNVERIFIED claim on its own: anything derived from it must be checked
   * against the routine's stored bindings (tenant-scoped), the way
   * `resolveVerifiedSpaceOwnerForRun` does.
   */
  triggerId?: string;
}

/**
 * The acting user's id for attribution columns (actor_user_id and friends),
 * or null when the caller is not a user — a service or agent principal's id
 * must never land in a column with a foreign key to core.users.
 */
export function actorUserIdFromAuth(
  auth?: Pick<PluginAuthContext, "principalId" | "principalType">
): string | null {
  if (!auth) {
    return null;
  }
  return (auth.principalType ?? "user") === "user" ? auth.principalId : null;
}

/** Input for recording a module audit event. Core fills actorId, tenantId, moduleId. */
export interface ModuleAuditEventInput {
  detail?: Record<string, unknown>;
  operationId?: string;
  type: string;
}

export interface PluginHttpRouteContext {
  /**
   * Space ids the caller may see, for a handler that lists records ACROSS
   * spaces — no `space_id` given. Narrowing
   * only: a list must intersect with it, never widen on it. Resolved on
   * demand; core supplies it on every authenticated route. Absent means the
   * host made no statement (in-process callers, tests).
   */
  accessibleSpaceIds?: () => Promise<string[]>;
  /** Per-request auth from core; present when route is authenticated. */
  auth?: PluginAuthContext;
  body?: unknown;
  /**
   * Invoke a gateway method by name. Injected by the host when gateway dispatch is available.
   * Modules can call host-registered methods (e.g. core.users.createInTenant) without depending on core.
   */
  callGatewayMethod?: (
    methodName: string,
    input: unknown,
    options?: { auth?: PluginAuthContext }
  ) => Promise<unknown>;
  config: Record<string, unknown>;
  dataDir?: string;
  headers?: unknown;
  hono: unknown;
  logger: PluginLogger;
  params?: unknown;
  pluginConfig: Record<string, unknown>;
  query?: unknown;
  /** Record a module-scoped audit event. Present when core provides audit logging. */
  recordAuditEvent?: (event: ModuleAuditEventInput) => void;
  request: Request;
  resolvePath: (p: string) => string;
}

export interface PluginHttpRoute {
  description?: string;
  handler: (ctx: PluginHttpRouteContext) => unknown | Promise<unknown>;
  /** When true, the route skips authentication (e.g. OAuth callbacks). */
  isPublic?: boolean;
  method: HttpMethod;
  operation?: PluginOperationMeta;
  operationId?: string;
  path: string;
  request?: PluginHttpRequestSchemas;
  responseMode?: PluginHttpResponseMode;
  responses?: Record<number, PluginHttpResponseSpec>;
  summary?: string;
  tags?: string[];
}

export interface PluginGatewayContext {
  /** Per-request auth from core; present when operation is authenticated. */
  auth?: PluginAuthContext;
  config: Record<string, unknown>;
  dataDir?: string;
  logger: PluginLogger;
  pluginConfig: Record<string, unknown>;
  /** Record a module-scoped audit event. Present when core provides audit logging. */
  recordAuditEvent?: (event: ModuleAuditEventInput) => void;
  resolvePath: (p: string) => string;
}

export interface PluginGatewayMethod {
  description?: string;
  handler: (
    input: unknown,
    ctx: PluginGatewayContext
  ) => unknown | Promise<unknown>;
  inputSchema?: ZodType;
  name: string;
  operation?: PluginOperationMeta;
  outputSchema?: ZodType;
  summary?: string;
}

export type PluginOperationRisk = "low" | "medium" | "high" | "critical";

export interface PluginOperationMeta {
  /**
   * Audit persistence override. Default: core classifier (mutations / high risk /
   * denials). `"never"` skips operation.executed for infra noise (heartbeats);
   * `"always"` forces a row even for low-risk reads.
   */
  audit?: "always" | "never";
  /**
   * Whether operation supports dry-run execution.
   */
  dryRunSupported?: boolean;
  /**
   * Whether operation may be safely retried.
   */
  idempotent?: boolean;
  /**
   * Predeclared `ui://` MCP App template for this operation, when one exists.
   */
  mcpAppResourceUri?: string;
  /**
   * MCP tool-surface disposition. Undeclared operations are inferred
   * conservatively (`never` for control-plane ids, `explicit_grant` for
   * writes / high risk, `default` for low-risk reads).
   */
  mcpDisposition?: McpDisposition;
  /**
   * Optional MCP tool annotations (read-only / destructive / idempotent hints).
   */
  mcpSafeAnnotations?: McpSafeAnnotations;
  /**
   * When true, eligible MCP clients that advertised `io.modelcontextprotocol/tasks`
   * may receive a durable task handle instead of a synchronous result.
   */
  mcpTaskCapable?: boolean;
  /**
   * Owning module id (usually plugin id). If omitted, runtime falls back to plugin id.
   */
  moduleId?: string;
  /**
   * Stable operation identifier. Defaults to method.name when omitted.
   */
  operationId?: string;
  /**
   * Fine-grained capabilities required for execution.
   */
  requiredCapabilities?: string[];
  /**
   * Force approval even if policy would otherwise allow.
   */
  requiresApproval?: boolean;
  /**
   * Risk level used by policy/approval engines.
   */
  riskLevel?: PluginOperationRisk;
  /**
   * How this operation relates to the active Space. Core enforces it before
   * dispatch: `space_owned` collection/create injects `auth.spaceId`;
   * get/update/delete refuse a record that lives in another Space.
   * `tenant_shared` never invents a `space_id`. Absent on a Space-placed
   * operation is a validation defect, not an implied tenant-shared default.
   */
  spacePolicy?: OperationSpacePolicy;
}

export interface PluginServerOperation extends PluginOperationMeta {
  description?: string;
  handler: PluginGatewayMethod["handler"];
  inputSchema?: ZodType;
  operationId: string;
  outputSchema?: ZodType;
  summary?: string;
}

/** Context passed to test data persist handlers. */
export interface PluginTestDataGenerateContext {
  /** Per-request auth from core; present when operation is authenticated. */
  auth?: PluginAuthContext;
  config: Record<string, unknown>;
  dataDir?: string;
  instructions?: string;
  logger: PluginLogger;
  pluginConfig: Record<string, unknown>;
  resolvePath: (p: string) => string;
  scopeId?: string;
  tenantId: string;
}

/** Metadata for a test data type registration. */
export interface PluginTestDataTypeMeta {
  /** Optional gateway operation id for apply (e.g. contacts.create). When set, apply uses module operations for audit/policy. */
  createOperationId?: string;
  /** Stable data type id (e.g. time_entries, projects). */
  data_type: string;
  /** Human-readable description. */
  description?: string;
  /** Owning module id (usually plugin id). */
  module_id: string;
  /** Zod schema for validating generated records before persist. */
  recordSchema: ZodType;
  /** Text description of record shape for LLM prompt (e.g. field names and types). */
  schemaDescription: string;
}

/** Full test data type registration with persist handler. */
export interface PluginTestDataRegistration {
  meta: PluginTestDataTypeMeta;
  /** Optional hook to normalize a record before core invokes createOperationId. */
  normalizeInput?: (
    record: Record<string, unknown>,
    ctx: { principalId: string }
  ) => Record<string, unknown>;
  /** Persist validated records. Returns created count or throws. */
  persist: (
    records: Record<string, unknown>[],
    ctx: PluginTestDataGenerateContext
  ) => Promise<number>;
}

/**
 * `"in_process"` is the module-to-module edge: one module's handler calling
 * another module's operation through the plugin runtime API, with no HTTP
 * request behind it. It runs the same policy as the HTTP transports; a profile
 * policy that must tell them apart reads this.
 */
export type PluginPolicyTransport =
  | "gateway"
  | "module_ops"
  | "mcp"
  | "http"
  | "in_process";

/**
 * Where a call physically came from, when that changes who owns the approval
 * UX. `"app"` means an engenty App's sandboxed frame drove it through the App
 * proxy: the bearer is the viewing user's token, but there is no interactive
 * chat turn behind it and therefore no AI pre-gate to present an approval
 * card. Policies that stay permissive for user principals on the strength of
 * that pre-gate must treat `"app"` as autonomous instead (CON-01).
 *
 * Absent means the ordinary interactive path.
 */
export type PluginCallOrigin = "app";

export interface PluginPolicyAuthContext {
  /** Present when a principal is acting on behalf of a user (e.g. chat agent). */
  actingForUserId?: string;
  /** Agent driving this request (Phase 4), if any. */
  agentId?: string;
  audience: string[];
  authMethod: "oauth" | "api_token" | "service_credential" | "unknown";
  /** Transport origin when it changes approval ownership. See {@link PluginCallOrigin}. */
  callOrigin?: PluginCallOrigin;
  capabilities: string[];
  delegationChain: string[];
  /** Goal/objective the agent run is executing; scope for approval grants. */
  goalId?: string;
  moduleIds: string[];
  permissions: string[];
  principalId: string;
  principalType: "user" | "agent" | "service";
  roleProfiles: string[];
  roles: string[];
  scopes: string[];
  sessionId?: string;
  /**
   * The space this call happens in, when the caller named one
   * (`x-engenty-space-id`) — PLAN-spaces.md Phase CN.3.
   *
   * Used ONLY to narrow: a policy intersects what the principal may already
   * reach with what the space mounts. That is what makes it safe to take from a
   * header without a membership check here — naming a space you are not in can
   * only remove candidates, never add one, because the principal's own sharing
   * and capability checks still run underneath. Absent means "no narrowing",
   * which is the pre-spaces behaviour every non-chat caller still has.
   */
  spaceId?: string;
  /**
   * Task the headless run executes (x-engenty-task-id). A claim, not a fact,
   * until checked against the task's stored space.
   */
  taskId?: string;
  tenantId: string;
  tokenType: "access" | "refresh" | "api_token" | "unknown";
  /**
   * Routine the headless run executes for (x-engenty-trigger-id) — subject for
   * routine-scoped grants, and the verifiable link a policy may check against
   * the routine's stored space binding. A claim, not a fact, until checked.
   */
  triggerId?: string;
}

export interface PluginPolicyInput {
  auth: PluginPolicyAuthContext;
  input?: unknown;
  moduleId: string;
  operationId: string;
  requiredCapabilities: string[];
  requiresApproval: boolean;
  riskLevel: PluginOperationRisk;
  scopeId?: string;
  transport?: PluginPolicyTransport;
}

export interface PluginPolicyDecision {
  action: "allow" | "deny" | "require_approval";
  /**
   * With `require_approval`: module-specific detail stored on the approval
   * request core files (e.g. which connection an ask resolved to), so the
   * module's approvals UI can describe the blocked call without keeping a
   * request store of its own.
   */
  approvalContext?: Record<string, unknown>;
  reason: string;
}

export type PluginProfilePolicy = (
  input: PluginPolicyInput
) => PluginPolicyDecision | null | Promise<PluginPolicyDecision | null>;

export type PluginResultPolicy = (
  input: PluginPolicyInput,
  result: unknown
) => PluginPolicyDecision | null;

/** Canonical plugin manifest shape exposed to plugin authors (normalized by core). */
export interface EngentyPluginManifest {
  capabilities?: {
    ai?: boolean;
    frontendTools?: boolean;
    operations?: boolean;
    ui?: boolean;
  };
  /**
   * Catalog group (one per plugin). See {@link PluginCategory}.
   * Omit for uncategorized / technical plugins.
   */
  category?: PluginCategory;
  description: string;
  /** One emoji for catalogs and the README module table. */
  emoji?: string;
  id: string;
  kind: string;
  /**
   * Operation id run with `{ space_id }` whenever this module is mounted into
   * a space, by every path that mounts it. Idempotent; creates whatever the
   * module needs in that space (a knowledge base row) and answers
   * `{ ready, needs? }`. Omit when a mount is usable as is.
   */
  mountOperation?: string;
  name: string;
  optional?: string[];
  provides?: string[];
  requires?: string[];
  server: {
    entry: string;
  };
  /** See {@link PluginStability}. Absent ⇒ stable. */
  stability?: PluginStability;
  /**
   * Capability tier. "module" (default) is deeply-integrated and unrestricted;
   * "plugin" is catalog-installed and capability-restricted.
   * See docs/content/dev/plugins/plugin-tiers.md.
   */
  tier?: "module" | "plugin";
  ui?: {
    assetOrigins?: string[];
    entry: string;
    export: string;
    load?: "runtime" | "workspace";
    staticAssets?: string[];
    tailwindSources?: string[];
  };
  version: string;
}

export interface PluginSourceInfo {
  generationId?: number;
  manifestId: string;
  manifestPath: string;
  packageName?: string;
  pluginId: string;
  registrationKind: string;
  rootDir: string;
  source: string;
  sourceType: "builtin" | "module" | "package";
  version?: string;
}

export interface PluginDiagnostic {
  code: string;
  level: "error" | "info" | "warn";
  message: string;
  pluginId?: string;
  remediation?: string;
  sourceInfo?: PluginSourceInfo;
}

export interface PluginRegistrationReceipt {
  dispose: () => Promise<void> | void;
  generationId?: number;
  id: string;
  kind: string;
  pluginId: string;
  sourceInfo: PluginSourceInfo;
}

export interface PluginRuntime {
  dispose?: () => Promise<void> | void;
}

export interface PluginConfigApi {
  readonly pluginConfig: Record<string, unknown>;
  readonly runtimeConfig: Record<string, unknown>;
}

export interface PluginDiagnosticsApi {
  report: (diagnostic: PluginDiagnostic) => void;
}

export interface PluginCapabilitiesApi {
  has: (capability: string) => boolean;
  provides: (capability: string) => void;
}

export interface PluginAiRegistration {
  agents?: unknown[];
  instruction_documents?: unknown[];
  module_id: string;
  skills?: unknown[];
  triggers?: unknown[];
  workflows?: unknown[];
}

export interface PluginServerApi {
  /**
   * Invoke a registered module operation by id (cross-module reads/writes).
   * The name is historical; dispatch resolves against registered operations.
   */
  callGatewayMethod: (
    methodName: string,
    input?: unknown,
    options?: { auth?: PluginAuthContext }
  ) => Promise<unknown | null>;
  /**
   * Shared context-graph server API. Available once the host has wired the
   * package and a database adapter is present; consumers should defensively
   * check for `undefined` to stay compatible with non-DB boot contexts.
   */
  contextGraph?: PluginContextGraphServerApi;
  /**
   * Read-only view of all registered context-graph sources. Used by the
   * context-graph package itself to expose dynamic HTTP status/sync routes.
   */
  contextGraphSources?: {
    get(id: string): ContextGraphSourceRegistration | undefined;
    list(): ContextGraphSourceRegistration[];
  };
  /** Queue service for background job processing when the host wires pgmq. */
  getQueueService?: () => QueueServiceLike | null;
  /**
   * Register a `SearchIndexProvider` for this module. The host synthesizes a
   * search operation (auto-tool), auto-subscribes declarative re-index
   * triggers, and exposes status/backfill via `/api/search-index/*`.
   */
  /**
   * Register a managed retrieval source with the central retrieval service
   * (`@engenty/retrieval`). The host manufactures a `SearchIndexProvider`
   * from it and routes it through `registerSearchIndexProvider`, so the
   * synthesized tool, event bindings, and `/api/search-index/*` surface are
   * identical to a hand-rolled provider. Optional: only hosts with the
   * retrieval service wired provide it.
   */
  /** Shared retrieval service handle (null until the first source registers). */
  getRetrievalService?: () => RetrievalServiceLike | null;
  /**
   * SERVICE-ROLE client — BYPASSES row-level security. This is never the
   * default: tenant work uses `getTenantDb(auth)`, where the database itself
   * confines every query to the caller's tenant. Reach for this accessor only
   * for the two sanctioned shapes, and leave an in-place comment saying which:
   *
   * 1. A read that must run BEFORE tenancy is known and IS the tenant
   *    resolution (webhook id+secret lookup, OAuth state-nonce lookup,
   *    portal/pairing token lookup, cross-tenant boot replay).
   * 2. A platform-level store that carries no tenant_id by design
   *    (external-connectors registry, OAuth client env).
   *
   * `pnpm check:leak-harness` and review both treat an uncommented call site
   * as a defect. (Renamed from getDatabaseAdapter in the Phase A hard cutover
   * — PLAN-tenant-isolation-a-rls-seam.md WP8.)
   */
  getServiceDb?: () => unknown | null;
  /** Storage service for a bucket. Injected by core when database adapter is available. */
  getStorageService?: (bucket: string) => StorageService | null;
  /**
   * Tenant-locked database handle for the server lane. The returned client runs as
   * the `engenty_server` role (NOBYPASSRLS) under a short-lived JWT carrying
   * `auth.tenantId`, so RLS confines every query — scoped or not — to that tenant.
   * Keep the explicit `.eq("tenant_id", …)` filters in DALs as the belt; this is
   * the wall. Returns `unknown` for the same reason as `getServiceDb`:
   * plugin-sdk keeps no runtime dependency on supabase-js.
   */
  getTenantDb?: (auth: TenantScope | { tenantId: string }) => unknown | null;
  /** Check whether a module operation is registered in the current backend registry. */
  hasOperation: (operationId: string) => boolean;
  /**
   * The platform notification host (@engenty/notifications), installed by
   * the loader before any plugin loads. Modules emit signals — never work
   * items — through it, register their own namespaced kinds, and register
   * transport channels they own. Absent only when core runs without a
   * database.
   */
  notifications?: NotificationsHostLike;
  /** Register orchestrator agents, actions, skills, and triggers for this module. */
  registerAiRegistration: (registration: PluginAiRegistration) => void;
  /** Register CLI commands owned by this module (host-owned Commander program). */
  registerCli: (
    registrar: CliRegistrar,
    opts?: { commands?: string[] }
  ) => void;
  /**
   * Install the context-graph host implementation. Called once by the
   * `@engenty/context-graph` plugin, which owns the shared singletons. The
   * host then delegates `contextGraph` / `registerContextGraphSchema` /
   * `registerContextGraphSource` to this provider, keeping core free of any
   * concrete `@engenty/context-graph` import.
   */
  registerContextGraphHost?: (host: ContextGraphHost) => void;
  /**
   * Register entity and edge types (and optional event bindings) with the
   * shared context graph. The host translates this into a registry merge
   * and, when `onEvents` is supplied, into `engenty.events.modules.on`
   * subscriptions that mirror module lifecycle events into the graph.
   * Returns `undefined` when no host has wired the surface (e.g. CLI boot
   * with no database adapter).
   */
  registerContextGraphSchema?: (
    registration: ContextGraphSchemaRegistration
  ) => PluginRegistrationReceipt | undefined;
  /**
   * Register a bulk-backfill source with the context graph. The host exposes
   * dynamic `/api/context-graph/sources/:id/status` and `.../sync` HTTP routes
   * for each registered source. No-op when the surface is unavailable.
   */
  registerContextGraphSource?: (source: ContextGraphSourceRegistration) => void;
  /** Register plugin-owned feature flag definitions with host provenance. */
  registerFeatureFlags: (
    definitions: _FeatureFlagDefinition[]
  ) => PluginRegistrationReceipt[];
  /** Register a plugin-owned HTTP route with provenance and tenant capability gating. */
  registerHttpRoute: (
    route: PluginHttpRoute
  ) => PluginRegistrationReceipt | undefined;
  /**
   * Target module-facing operation registration API.
   */
  registerOperation: (
    operation: PluginServerOperation
  ) => PluginRegistrationReceipt | undefined;
  /** Register a profile merge policy for tenant profile composition. */
  registerProfilePolicy: (policy: PluginProfilePolicy) => void;
  /** Register queue display metadata for the manage UI. */
  registerQueue?: (queue: QueueDefinition) => void;
  /** Register a background queue job handler. */
  registerQueueHandler?: (
    queueName: string,
    handler: (
      payload: Record<string, unknown>,
      meta: { msgId: number; readCount: number }
    ) => Promise<void>
  ) => void;
  /** Register a merge policy for structured tool/operation results. */
  registerResultPolicy: (policy: PluginResultPolicy) => void;
  registerRetrievalSource?: (
    registration: RetrievalSourceRegistration
  ) => PluginRegistrationReceipt | undefined;
  /**
   * Register role profiles (named capability bundles) contributed by this
   * plugin. Assignable to users/agents; resolved to capability strings by
   * `resolveGrants`. Ids share a namespace — re-registering another plugin's
   * id throws.
   */
  registerRoleProfiles: (profiles: RoleProfile[]) => void;
  registerSearchIndexProvider: (
    provider: SearchIndexProvider,
    options: PluginSearchIndexRegistrationOptions
  ) => PluginRegistrationReceipt | undefined;
  /** Register a long-running plugin service (start/stop lifecycle). */
  registerService: (service: PluginService) => void;
  /**
   * Register this module's face in the space Data tree (PLAN-space-data.md D2).
   *
   * The adapter renders module rows as nodes and translates every read and
   * write into the module's own registered operations — it is a PROJECTION, not
   * a second data path. Core makes the root visible only where the module is
   * mounted, so registering one grants nothing on its own.
   */
  registerSpaceDataAdapter?: (
    adapter: SpaceDataAdapter
  ) => PluginRegistrationReceipt | undefined;
  /** Register a plugin-owned test data type with registry provenance. */
  registerTestDataType: (
    registration: PluginTestDataRegistration
  ) => PluginRegistrationReceipt | undefined;
  /** Resolve a path relative to the plugin data directory. */
  resolvePath: (relativePath: string) => string;
}

/**
 * Bridges {@link PluginServerApi} to a small `invokeOperation` surface for
 * cross-module operation calls from module code. Centralizes the
 * `callGatewayMethod` identifier in the SDK so first-party modules can stay
 * free of that substring for metadata guardrails while still using the same
 * host registry dispatch as {@link PluginServerApi.callGatewayMethod}.
 */
export interface PluginServerGatewayCaller {
  hasOperation: PluginServerApi["hasOperation"];
  invokeOperation: (
    methodName: string,
    input?: unknown,
    options?: { auth?: PluginAuthContext }
  ) => Promise<unknown | null>;
}

export function createPluginServerGatewayCaller(
  server: Pick<PluginServerApi, "callGatewayMethod" | "hasOperation">
): PluginServerGatewayCaller {
  return {
    hasOperation: server.hasOperation.bind(server),
    invokeOperation: (methodName, input, options) =>
      server.callGatewayMethod(methodName, input, options),
  };
}

export type PluginUiApi = Record<string, never>;

export type PluginAiApi = Record<string, never>;

export type PluginFrontendToolsApi = Record<string, never>;

export interface EngentyPluginApi {
  ai: PluginAiApi;
  capabilities: PluginCapabilitiesApi;
  config: PluginConfigApi;
  diagnostics: PluginDiagnosticsApi;
  events: PluginEventsApi;
  frontendTools: PluginFrontendToolsApi;
  id: string;
  manifest: EngentyPluginManifest;
  server: PluginServerApi;
  source: PluginSourceInfo;
  ui: PluginUiApi;
}

export type EngentyPluginFactory = (
  engenty: EngentyPluginApi
) => PluginRuntime | Promise<void> | void;

/** Backend-agnostic file storage contract. @see docs/dev/backend-abstraction.md */
export interface StorageService {
  /** Delete a file. Available when backed by FileStorageService. */
  delete?(key: string): Promise<void>;
  download(key: string): Promise<Uint8Array | null>;
  /** Check if a file exists. Available when backed by FileStorageService. */
  exists?(key: string): Promise<boolean>;
  getUrl(
    key: string,
    options?: { signed?: boolean; expiresIn?: number }
  ): Promise<string>;
  /** List files under a prefix. Available when backed by FileStorageService. */
  list?(
    prefix: string,
    options?: { limit?: number; offset?: number; search?: string }
  ): Promise<{ files: unknown[]; total: number }>;
  upload(
    key: string,
    buffer: Blob | ArrayBuffer | Uint8Array,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<undefined | unknown>;
}

/**
 * Minimal notifications contract exposed to plugins. Structural on purpose —
 * the package implements it; plugin-sdk carries no dependency on it.
 * @see packages/notifications
 */
export interface NotificationsHostLike {
  /**
   * Write one record. Resolves the audience (place before person: a shared
   * decision goes to its space, a person only when the subject is theirs),
   * derives the class, dedupes. Owner and initiator of shared work are
   * subscribers (pushed, mailed), never its audience.
   */
  emit(input: {
    actor?: { id?: string | null; kind: "agent" | "user" | "system" } | null;
    assigneeUserId?: string | null;
    /** One plain line under the title (a message preview); cut to 140. */
    body?: string | null;
    audience?:
      | { kind: "tenant" }
      | { kind: "user"; userId: string }
      | { kind: "stream"; key: string }
      | { kind: "space"; spaceId: string }
      | null;
    dedupeKey?: string | null;
    initiatorUserId?: string | null;
    kind: string;
    metadata?: Record<string, unknown> | null;
    ownerUserId?: string | null;
    /** A private subject's people: one row each. */
    participantUserIds?: readonly string[] | null;
    payload?: Record<string, unknown> | null;
    /** People already looking at it: their view starts seen. */
    preSeenUserIds?: readonly string[] | null;
    priority?: "low" | "medium" | "high" | "urgent";
    source: string;
    spaceId?: string | null;
    subject?: { id: string; type: string } | null;
    /** Extra people pushed/mailed about a shared row. */
    subscribers?: readonly string[] | null;
    /**
     * English fallback line. Optional with a `title` (the rendered title is
     * the summary then); one of the two is required.
     */
    summary?: string | null;
    /** In-app route of the subject; absent → built from the ids. */
    target?: string | null;
    tenantId: string;
    /**
     * What the row says: a key of the core's NOTIFICATION_TITLES plus the
     * names it uses (never ids). `{actor}` is filled from the actor.
     */
    title?: {
      key: string;
      params?: Record<string, string | number>;
    } | null;
  }): Promise<unknown>;
  /**
   * Read-sync: a producing surface knows the person consumed its records
   * there (a chat read cursor moved past the message) — flip them to seen.
   */
  markSeenWhere(input: {
    accessibleSpaceIds?: readonly string[];
    predicate: (record: unknown) => boolean;
    tenantId: string;
    userId: string;
  }): Promise<number>;
  /** Register a transport this plugin owns; returns the unregister. */
  registerChannel(channel: {
    accepts?(record: unknown, target: Record<string, unknown>): boolean;
    deliver(
      record: unknown,
      target: Record<string, unknown>,
      ctx: { tenantId: string }
    ): Promise<void>;
    id: string;
  }): () => void;
  /** Declare this plugin's kinds (`<module>.<kind>`) with their class. */
  registerKinds(
    entries: Record<string, "decision" | "alert" | "todo" | "update">
  ): void;
  /** The subject moved on: resolve every open record about it. */
  resolve(input: {
    outcome: "resumed" | "completed" | "failed";
    subjectId: string;
    subjectType: string;
    tenantId: string;
  }): Promise<number>;
}

/** Minimal queue contract exposed to plugins. @see packages/queue */
export interface QueueServiceLike {
  /** Send a message to a named queue. Returns the message ID. */
  send(
    queue: string,
    payload: Record<string, unknown>,
    delaySec?: number
  ): Promise<number>;
  /** Send a batch of messages. Returns an array of message IDs. */
  sendBatch(
    queue: string,
    payloads: Record<string, unknown>[],
    delaySec?: number
  ): Promise<number[]>;
}

/** Queue display metadata registered by plugins for the manage UI. */
export interface QueueDefinition {
  /** TailwindCSS color classes for badge display. */
  color?: string;
  /** Optional human-readable description. */
  description?: string;
  /** Short display label for the manage UI (e.g. "Download"). */
  label: string;
  /** The pgmq queue name (e.g. "inbox_download_attachments"). */
  name: string;
}
