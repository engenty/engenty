import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import {
  getBaseInstructionDocumentByKey,
  listBaseInstructionDocuments,
} from "../ai/instructions/base-documents.js";
import {
  type AiInstructionDocument,
  EDIT_SCOPE_TO_LAYER,
  type InstructionEditScope,
  isInstructionEditScope,
} from "../ai/instructions/types.js";
import type { AiRegistry } from "../ai/registry/types.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { InstructionOverridesStore } from "../dal/instructions/instruction-overrides-store.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

export interface RegisterInstructionRoutesOptions {
  getRegistry: (tenantId: string) => AiRegistry;
  getStore: () => InstructionOverridesStore | null;
  scopeResolver: AiScopeResolver;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseEditBody(value: unknown): {
  body: string;
  createVersion: boolean;
  documentKey: string;
  reason: string | null;
  scope: InstructionEditScope;
  title: string | null;
} | null {
  if (!(typeof value === "object" && value !== null)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const documentKey =
    typeof candidate.documentKey === "string"
      ? candidate.documentKey.trim()
      : "";
  const body =
    typeof candidate.body === "string" ? candidate.body.trimEnd() : "";
  const title =
    typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim()
      : null;
  const reason =
    typeof candidate.reason === "string" && candidate.reason.trim()
      ? candidate.reason.trim()
      : null;
  const scope = typeof candidate.scope === "string" ? candidate.scope : "";
  if (!(documentKey && body && isInstructionEditScope(scope))) {
    return null;
  }
  return {
    body,
    createVersion: candidate.createVersion === true,
    documentKey,
    reason,
    scope,
    title,
  };
}

function parseRollbackBody(value: unknown): {
  changeId: string;
  documentKey: string;
  reason: string | null;
  scope: InstructionEditScope;
} | null {
  if (!(typeof value === "object" && value !== null)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const changeId =
    typeof candidate.changeId === "string" ? candidate.changeId.trim() : "";
  const documentKey =
    typeof candidate.documentKey === "string"
      ? candidate.documentKey.trim()
      : "";
  const reason =
    typeof candidate.reason === "string" && candidate.reason.trim()
      ? candidate.reason.trim()
      : null;
  const scope = typeof candidate.scope === "string" ? candidate.scope : "";
  if (!(changeId && documentKey && isInstructionEditScope(scope))) {
    return null;
  }
  return { changeId, documentKey, reason, scope };
}

async function applyEdit(params: {
  baseDocument: AiInstructionDocument;
  body: string;
  createVersion: boolean;
  reason: string | null;
  scope: InstructionEditScope;
  store: InstructionOverridesStore;
  tenantId: string;
  title: string | null;
  userId: string;
}) {
  const now = nowIso();
  const existing = await params.store.getScopedOverride({
    documentKey: params.baseDocument.document_key,
    scope: params.scope,
    tenantId: params.tenantId,
    userId: params.userId,
  });
  const document = await params.store.upsertOverride({
    id: existing?.id ?? randomUUID(),
    body: params.body,
    created_at: existing?.created_at ?? now,
    created_by_user_id: existing?.created_by_user_id ?? params.userId,
    document_key: params.baseDocument.document_key,
    is_active: true,
    layer: EDIT_SCOPE_TO_LAYER[params.scope],
    metadata: {
      ...params.baseDocument.metadata,
      ...(existing?.metadata ?? {}),
      based_on_document_id: params.baseDocument.id,
      edit_scope: params.scope,
    },
    module_id: params.baseDocument.module_id,
    source_kind: "user",
    tenant_id: params.tenantId,
    title: params.title ?? existing?.title ?? params.baseDocument.title,
    updated_by_user_id: params.userId,
    version: params.createVersion
      ? (existing?.version ?? 0) + 1
      : (existing?.version ?? 1),
  });
  const change = params.createVersion
    ? await params.store.appendChange({
        approved_at: now,
        approved_by_user_id: params.userId,
        change_reason: params.reason,
        created_at: now,
        id: randomUUID(),
        instruction_doc_id: document.id,
        next_body: params.body,
        previous_body: existing?.body ?? null,
        status: "applied",
      })
    : null;
  return { change, document };
}

export function registerInstructionRoutes(
  app: Hono<any>,
  options: RegisterInstructionRoutesOptions
) {
  const { getRegistry, getStore, scopeResolver } = options;

  // Catalog: file-derived base documents merged with persisted overrides.
  app.get(`${AI_BASE_PATH}/instructions`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    try {
      const registry = getRegistry(resolved.scope.tenantId);
      const store = getStore();
      const [baseDocuments, overrides] = await Promise.all([
        listBaseInstructionDocuments(registry, nowIso()),
        store
          ? store.listActiveOverrides({
              tenantId: resolved.scope.tenantId,
              userId: resolved.scope.userId,
            })
          : Promise.resolve([]),
      ]);
      return c.json({ documents: [...baseDocuments, ...overrides] });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list instruction documents",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/instructions/resolve`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const documentKey = (c.req.query("documentKey") ?? "").trim();
    const scopeRaw = (c.req.query("scope") ?? "tenant").trim();
    if (!(documentKey && isInstructionEditScope(scopeRaw))) {
      return c.json(
        { error: "documentKey and a valid scope are required" },
        400
      );
    }
    try {
      const registry = getRegistry(resolved.scope.tenantId);
      const store = getStore();
      const baseDocument = await getBaseInstructionDocumentByKey(
        registry,
        documentKey,
        nowIso()
      );
      if (!baseDocument) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      const [tenantOverride, userOverride] = store
        ? await Promise.all([
            store.getScopedOverride({
              documentKey,
              scope: "tenant",
              tenantId: resolved.scope.tenantId,
              userId: resolved.scope.userId,
            }),
            store.getScopedOverride({
              documentKey,
              scope: "user",
              tenantId: resolved.scope.tenantId,
              userId: resolved.scope.userId,
            }),
          ])
        : [null, null];
      const effectiveDocument =
        scopeRaw === "user"
          ? (userOverride ?? tenantOverride ?? baseDocument)
          : (tenantOverride ?? baseDocument);
      return c.json({
        base_document: baseDocument,
        effective_document: effectiveDocument,
        scope: scopeRaw,
        tenant_override: tenantOverride,
        user_override: userOverride,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to resolve instruction document",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/instructions/history`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const documentKey = (c.req.query("documentKey") ?? "").trim();
    const scopeRaw = (c.req.query("scope") ?? "tenant").trim();
    if (!(documentKey && isInstructionEditScope(scopeRaw))) {
      return c.json(
        { error: "documentKey and a valid scope are required" },
        400
      );
    }
    try {
      const store = getStore();
      const document = store
        ? await store.getScopedOverride({
            documentKey,
            scope: scopeRaw,
            tenantId: resolved.scope.tenantId,
            userId: resolved.scope.userId,
          })
        : null;
      const changes =
        store && document
          ? await store.listChanges({
              instruction_doc_id: document.id,
              limit: 50,
            })
          : [];
      return c.json({ changes, document, scope: scopeRaw });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list instruction history",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.put(`${AI_BASE_PATH}/instructions/edit`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const input = parseEditBody(body);
    if (!input) {
      return c.json(
        { error: "documentKey, scope, and body are required" },
        422
      );
    }
    try {
      const registry = getRegistry(resolved.scope.tenantId);
      const baseDocument = await getBaseInstructionDocumentByKey(
        registry,
        input.documentKey,
        nowIso()
      );
      if (!baseDocument) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      const result = await applyEdit({
        baseDocument,
        body: input.body,
        createVersion: input.createVersion,
        reason: input.reason,
        scope: input.scope,
        store,
        tenantId: resolved.scope.tenantId,
        title: input.title,
        userId: resolved.scope.userId,
      });
      return c.json(result);
    } catch (err) {
      return handleRouteError(
        c,
        "failed to edit instruction document",
        "agent_sessions.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/instructions/rollback`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = getStore();
    if (!store) {
      return c.json({ error: "agent_sessions.unconfiguredDatabase" }, 503);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const input = parseRollbackBody(body);
    if (!input) {
      return c.json(
        { error: "documentKey, scope, and changeId are required" },
        422
      );
    }
    try {
      const document = await store.getScopedOverride({
        documentKey: input.documentKey,
        scope: input.scope,
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
      });
      if (!document) {
        return c.json({ error: "No override found to roll back" }, 404);
      }
      const changes = await store.listChanges({
        instruction_doc_id: document.id,
        limit: 100,
      });
      const change = changes.find((entry) => entry.id === input.changeId);
      if (!change) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      if (!change.previous_body) {
        return c.json({ error: "Selected change cannot be rolled back" }, 409);
      }
      const registry = getRegistry(resolved.scope.tenantId);
      const baseDocument = await getBaseInstructionDocumentByKey(
        registry,
        input.documentKey,
        nowIso()
      );
      if (!baseDocument) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      const result = await applyEdit({
        baseDocument,
        body: change.previous_body,
        createVersion: true,
        reason: input.reason ?? `Rollback of change ${change.id}`,
        scope: input.scope,
        store,
        tenantId: resolved.scope.tenantId,
        title: document.title,
        userId: resolved.scope.userId,
      });
      return c.json({ reverted_change_id: change.id, ...result });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to roll back instruction document",
        "agent_sessions.internalError",
        err
      );
    }
  });
}
