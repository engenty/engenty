import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import {
  agentAppendDocumentKey,
  isAppendDocumentKey,
  normalizeAppendFilename,
  parseAppendDocumentKey,
  slugifyInstructionFilename,
  syntheticAppendBaseDocument,
} from "../ai/instructions/append-documents.js";
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
  // Allow empty body for append stubs; require a non-empty string type.
  if (
    !(
      documentKey &&
      typeof candidate.body === "string" &&
      isInstructionEditScope(scope)
    )
  ) {
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

function parseCreateBody(value: unknown): {
  agentId: string;
  body: string;
  filename: string;
  scope: InstructionEditScope;
} | null {
  if (!(typeof value === "object" && value !== null)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const agentId =
    typeof candidate.agentId === "string" ? candidate.agentId.trim() : "";
  const filename =
    typeof candidate.filename === "string" ? candidate.filename.trim() : "";
  const scope = typeof candidate.scope === "string" ? candidate.scope : "";
  const body =
    typeof candidate.body === "string" ? candidate.body.trimEnd() : "";
  if (!(agentId && filename && isInstructionEditScope(scope))) {
    return null;
  }
  return { agentId, body, filename, scope };
}

async function resolveEditableBaseDocument(params: {
  documentKey: string;
  registry: AiRegistry;
  store: InstructionOverridesStore | null;
  tenantId: string;
  userId: string;
}): Promise<AiInstructionDocument | null> {
  const seed = await getBaseInstructionDocumentByKey(
    params.registry,
    params.documentKey,
    nowIso()
  );
  if (seed) {
    return seed;
  }
  if (!isAppendDocumentKey(params.documentKey)) {
    return null;
  }
  const parsed = parseAppendDocumentKey(params.documentKey);
  if (!parsed) {
    return null;
  }
  const existing =
    params.store == null
      ? null
      : ((await params.store.getScopedOverride({
          documentKey: params.documentKey,
          scope: "user",
          tenantId: params.tenantId,
          userId: params.userId,
        })) ??
        (await params.store.getScopedOverride({
          documentKey: params.documentKey,
          scope: "tenant",
          tenantId: params.tenantId,
          userId: params.userId,
        })));
  const filename =
    typeof existing?.metadata.filename === "string"
      ? existing.metadata.filename
      : `${parsed.slug}.md`;
  return syntheticAppendBaseDocument({
    agentId: parsed.agentId,
    documentKey: params.documentKey,
    filename,
    nowIso: nowIso(),
    title: existing?.title,
  });
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

function parseResetBody(value: unknown): {
  documentKey: string;
  reason: string | null;
  scope: InstructionEditScope;
} | null {
  if (!(typeof value === "object" && value !== null)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const documentKey =
    typeof candidate.documentKey === "string"
      ? candidate.documentKey.trim()
      : "";
  const reason =
    typeof candidate.reason === "string" && candidate.reason.trim()
      ? candidate.reason.trim()
      : null;
  const scope = typeof candidate.scope === "string" ? candidate.scope : "";
  if (!(documentKey && isInstructionEditScope(scope))) {
    return null;
  }
  return { documentKey, reason, scope };
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
      ...(isAppendDocumentKey(params.baseDocument.document_key)
        ? { append: true }
        : {}),
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
      const baseDocument = await resolveEditableBaseDocument({
        documentKey,
        registry,
        store,
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
      });
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
      const baseDocument = await resolveEditableBaseDocument({
        documentKey: input.documentKey,
        registry,
        store,
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
      });
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

  // Create an append-only instruction file for an agent (concatenated after AGENTS.md).
  app.post(`${AI_BASE_PATH}/instructions`, async (c) => {
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
    const input = parseCreateBody(body);
    if (!input) {
      return c.json(
        { error: "agentId, filename, and scope are required" },
        422
      );
    }
    try {
      const registry = getRegistry(resolved.scope.tenantId);
      const listable = registry as AiRegistry & {
        listAgentConfigs?: () => Promise<Array<{ id: string }>>;
      };
      const configs =
        typeof listable.listAgentConfigs === "function"
          ? await listable.listAgentConfigs()
          : [];
      if (!configs.some((config) => config.id === input.agentId)) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      const filename = normalizeAppendFilename(input.filename);
      const slug = slugifyInstructionFilename(filename);
      const documentKey = agentAppendDocumentKey(input.agentId, slug);
      const existing = await store.getScopedOverride({
        documentKey,
        scope: input.scope,
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
      });
      if (existing) {
        return c.json({ error: "instructions.fileExists", documentKey }, 409);
      }
      const baseDocument = syntheticAppendBaseDocument({
        agentId: input.agentId,
        documentKey,
        filename,
        nowIso: nowIso(),
      });
      const starter =
        input.body.trim().length > 0
          ? input.body
          : `# ${filename.replace(/\.md$/i, "")}\n`;
      const result = await applyEdit({
        baseDocument,
        body: starter,
        createVersion: true,
        reason: "Created append instruction",
        scope: input.scope,
        store,
        tenantId: resolved.scope.tenantId,
        title: baseDocument.title,
        userId: resolved.scope.userId,
      });
      return c.json(result, 201);
    } catch (err) {
      return handleRouteError(
        c,
        "failed to create instruction document",
        "agent_sessions.internalError",
        err
      );
    }
  });

  // Clear the scoped override so the editor + resolve fall back to seed/base.
  app.post(`${AI_BASE_PATH}/instructions/reset`, async (c) => {
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
    const input = parseResetBody(body);
    if (!input) {
      return c.json({ error: "documentKey and scope are required" }, 422);
    }
    try {
      const registry = getRegistry(resolved.scope.tenantId);
      const baseDocument = await resolveEditableBaseDocument({
        documentKey: input.documentKey,
        registry,
        store,
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
      });
      if (!baseDocument) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      const cleared = await store.deactivateScopedOverride({
        documentKey: input.documentKey,
        reason: input.reason,
        scope: input.scope,
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
      });
      const [tenantOverride, userOverride] = await Promise.all([
        store.getScopedOverride({
          documentKey: input.documentKey,
          scope: "tenant",
          tenantId: resolved.scope.tenantId,
          userId: resolved.scope.userId,
        }),
        store.getScopedOverride({
          documentKey: input.documentKey,
          scope: "user",
          tenantId: resolved.scope.tenantId,
          userId: resolved.scope.userId,
        }),
      ]);
      const effectiveDocument =
        input.scope === "user"
          ? (userOverride ?? tenantOverride ?? baseDocument)
          : (tenantOverride ?? baseDocument);
      if (!cleared) {
        return c.json(
          {
            base_document: baseDocument,
            cleared: false,
            effective_document: effectiveDocument,
            scope: input.scope,
            tenant_override: tenantOverride,
            user_override: userOverride,
          },
          200
        );
      }
      return c.json({
        base_document: baseDocument,
        change: cleared.change,
        cleared: true,
        document: cleared.document,
        effective_document: effectiveDocument,
        scope: input.scope,
        tenant_override: tenantOverride,
        user_override: userOverride,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to reset instruction document",
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
      const baseDocument = await resolveEditableBaseDocument({
        documentKey: input.documentKey,
        registry,
        store,
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
      });
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
