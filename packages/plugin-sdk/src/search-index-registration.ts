// Plugin SDK contract for declarative search-index registration.
//
// Modules that expose a `SearchIndexProvider` register it through
// `engenty.server.registerSearchIndexProvider(provider, options)` instead of
// hand-rolling a `<module>.search` operation, a Mastra tool, and entity event
// listeners. The host translates the registration into:
//
//   1. A synthesized `<module>.search` (or `<module>.<entity>.search`) module
//      operation — flows through `/api/tools/contracts` and the apps/ai
//      catalog runner so agents see a typed search tool automatically.
//
//   2. Optional auto-subscriptions to `onEvents` bindings via
//      `engenty.events.modules.on(...)`, which call `provider.replaceDocument`
//      / `provider.deleteDocument` whenever the source entity changes.
//
//   3. Operator surfaces (`/api/search-index/*` and the Manage UI) backed by
//      the provider's `getStatus` / `backfill` methods.

import type {
  SearchIndexProvider,
  SearchProviderCapabilities,
} from "@engenty/search-index";
import type { ZodType } from "zod";
import type { PluginOperationRisk } from "./index.js";
import type { PluginEventPayload } from "./plugin-events.js";
import type { OperationSpacePolicy } from "./space-policy.js";

// Re-export the contract surface so module authors can import it from one place.
export type {
  SearchDocument,
  SearchIndexProvider,
  SearchIndexRegistration,
  SearchIndexRegistrationMetadata,
  SearchIndexRegistry,
  SearchIndexStatus,
  SearchProviderCapabilities,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "@engenty/search-index";

// One declarative trigger for `provider.replaceDocument` / `deleteDocument`.
//
// `name` is a `<module>.<entity>.{created|updated|deleted}` string that the
// emitting module publishes via `events.modules.emit`. `docId` extracts the
// stable document id from the payload. `action: "delete"` invokes
// `deleteDocument`; `"replace"` invokes either `load` (when present) or
// `provider.getDocumentById` to fetch the fresh document, then upserts it.
export interface SearchIndexEventBinding<
  TPayload extends PluginEventPayload = PluginEventPayload,
> {
  action: "delete" | "replace";
  docId: (payload: TPayload) => string | string[] | null | undefined;
  // Optional payload->document loader. Required for `action: "replace"` when
  // the provider does not implement `getDocumentById`.
  load?: (payload: TPayload) => Promise<unknown | null> | unknown | null;
  name: string;
  // When true, listener is invoked only when the emit context has a tenantId
  // matching the document. Defaults to true.
  tenantScoped?: boolean;
}

export interface PluginSearchIndexRegistrationOptions {
  // Capabilities the synthesized tool advertises; falls back to provider's own.
  capabilities?: SearchProviderCapabilities;
  // Singular noun used in the synthesized operation id and tool name.
  entityName: string;
  // Zod schema for the provider's TFilters; merged into the synthesized
  // operation's `inputSchema.filters`.
  filtersSchema?: ZodType;
  // Tenant-less / cross-tenant provider. The admin surface gates `isSystem`
  // providers behind the superadmin scope; tenant-scoped providers are
  // visible to tenant admins. Defaults to `false`.
  isSystem?: boolean;
  // Stable owning module id (e.g. `"contacts"`, `"knowledge-base"`).
  moduleId: string;
  // Declarative re-index triggers; see `SearchIndexEventBinding`.
  onEvents?: SearchIndexEventBinding[];
  // Optional override of the synthesized operation id. Defaults to
  // `${moduleId}.${entityName}.search`.
  operationId?: string;
  // Tweaks for the synthesized operation registration.
  operationOverrides?: {
    description?: string;
    idempotent?: boolean;
    requiredCapabilities?: string[];
    requiresApproval?: boolean;
    riskLevel?: PluginOperationRisk;
    summary?: string;
  };
  // Skip auto-tool synthesis; useful for system providers (e.g. core api-catalog)
  // that should be operator-callable but not surfaced to agents.
  skipAutoTool?: boolean;
  // Space membership for the synthesized search operation. Forwarded onto the
  // PluginServerOperation so catalog `record_scope` is the declared kind —
  // never guessed. Omit rather than defaulting to tenant_shared.
  spacePolicy?: OperationSpacePolicy;
}

export interface PluginSearchIndexRegistration {
  options: PluginSearchIndexRegistrationOptions;
  provider: SearchIndexProvider;
}

// Reserved core event emitted whenever a declarative re-index attempt fails.
// Subscribers (telemetry, alerting) can fan out without blocking the original
// emit. Payload: `{ provider_id, event_name, action, doc_id, error }`.
export const SEARCH_INDEX_REFRESH_FAILED_EVENT =
  "core.search_index.refresh_failed";
