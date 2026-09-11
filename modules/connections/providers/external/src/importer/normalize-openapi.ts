import { ImportValidationError } from "../errors.js";
import type { JsonPatchOperation } from "../registry-client.js";
import type { NormalizedAction, NormalizeResult } from "../types.js";
import { classifyHttpOperation } from "./classify.js";

/**
 * OpenAPI spec text → normalized actions, via the executor openapi core
 * (`parse` + `extract` handle $refs, parameter styles, and merge path/query/
 * header/body params into one JSON-Schema input with the body under `body`).
 *
 * The executor/effect packages are imported LAZILY: they run ONLY at admin
 * import/refresh time, never at plugin boot or action execute time — the
 * stored `NormalizedAction[]` is what boot and execute consume. (Same
 * lazy-import posture the AI app uses for heavyweight optional deps.)
 *
 * Registry `specOverrides` are RFC 6902 patches the registry publishes to
 * correct a published spec (Figma's truncated OAuth scopes, say). They are
 * applied to the parsed document *before* extraction, and a patch that does
 * not apply fails the import instead of silently normalizing the unpatched
 * spec.
 */

/** Hard cap per connector; drops are counted and surfaced, never silent. */
export const MAX_ACTIONS_PER_CONNECTOR = 500;

/** Spec size ceiling, checked before the body is read and again after. */
export const MAX_SPEC_BYTES = 5 * 1024 * 1024;

function snakeCaseId(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase()
    .slice(0, 60);
}

export async function normalizeOpenApiSpec(
  specText: string,
  options?: { specOverrides?: JsonPatchOperation[] }
): Promise<NormalizeResult> {
  if (Buffer.byteLength(specText, "utf8") > MAX_SPEC_BYTES) {
    throw new ImportValidationError(
      `spec too large (> ${MAX_SPEC_BYTES / (1024 * 1024)} MB); import a smaller spec or use a filtered variant`
    );
  }
  const overrides = options?.specOverrides ?? [];
  const [{ extract, parse }, { Effect, Option }] = await Promise.all([
    import("@executor-js/plugin-openapi/core"),
    import("effect"),
  ]);
  const optional = <T>(value: { _tag: string }): T | undefined =>
    Option.getOrUndefined(
      value as Parameters<typeof Option.getOrUndefined>[0]
    ) as T | undefined;

  const doc = await Effect.runPromise(parse(specText));
  if (overrides.length > 0) {
    const { applyPatch } = await import("rfc6902");
    const failures = applyPatch(
      doc as object,
      overrides as Parameters<typeof applyPatch>[1]
    ).filter((error) => error !== null);
    if (failures.length > 0) {
      throw new ImportValidationError(
        `registry spec overrides do not apply to this spec: ${failures
          .map((error) => error.message)
          .join("; ")}`
      );
    }
  }
  const extracted = await Effect.runPromise(extract(doc));

  /** Substitute server-URL variables with their declared defaults. */
  const resolveServerBaseUrl = (): string | null => {
    const server = extracted.servers[0];
    if (!server) {
      return null;
    }
    const variables =
      optional<Record<string, { readonly default: string }>>(
        server.variables
      ) ?? {};
    const url = server.url.replace(
      /\{([^}]+)\}/gu,
      (match, name: string) => variables[name]?.default ?? match
    );
    return url.replace(/\/+$/u, "");
  };

  const actions: NormalizedAction[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const seenIds = new Set<string>();
  let droppedCount = 0;

  for (const op of extracted.operations) {
    if (op.deprecated) {
      skipped.push({ id: op.operationId, reason: "deprecated" });
      continue;
    }
    if (actions.length >= MAX_ACTIONS_PER_CONNECTOR) {
      droppedCount += 1;
      continue;
    }
    let id = snakeCaseId(op.operationId);
    if (!id) {
      id = snakeCaseId(`${op.method}_${op.pathTemplate}`);
    }
    if (!id) {
      skipped.push({ id: op.operationId, reason: "unusable operation id" });
      continue;
    }
    while (seenIds.has(id)) {
      id = `${id}_${op.method.toLowerCase()}`.slice(0, 60);
      if (seenIds.has(id)) {
        id = `${id}2`;
      }
    }
    seenIds.add(id);

    const inputSchema = optional<Record<string, unknown>>(op.inputSchema);
    const requestBody = optional<{ contentType: string }>(op.requestBody);
    const summary =
      optional<string>(op.summary) ??
      `${op.method.toUpperCase()} ${op.pathTemplate}`;

    actions.push({
      classification: classifyHttpOperation(op.method, op.pathTemplate),
      description: optional<string>(op.description) ?? summary,
      id,
      input_json_schema: inputSchema ?? {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
      invoke: {
        body_content_type: requestBody?.contentType ?? null,
        kind: "http",
        method: op.method,
        params: op.parameters.map((param) => ({
          location: param.location,
          name: param.name,
          required: param.required,
        })),
        path_template: op.pathTemplate,
      },
      summary,
      tags: [...op.tags],
    });
  }

  const securitySchemes =
    (doc as { components?: { securitySchemes?: Record<string, unknown> } })
      .components?.securitySchemes ?? null;

  return {
    actions,
    applied_overrides: overrides.length,
    base_url: resolveServerBaseUrl(),
    description: optional<string>(extracted.description) ?? null,
    dropped_count: droppedCount,
    security_schemes: securitySchemes,
    skipped,
    title: optional<string>(extracted.title) ?? null,
  };
}
