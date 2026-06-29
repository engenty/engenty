/**
 * Single-source frontend-tool specs: a zod schema plus metadata. The JSON Schema the
 * agent sees and the harness `FrontendToolDefinition` are *generated* from one schema,
 * so the server tool catalog and the client handler can derive from the same source.
 *
 * Server-safe (no React): the server imports a tool's spec to build its catalog; the
 * client (`@engenty/ai-ui`) reuses the same spec to register a typed browser handler.
 */
import type { z } from "zod";
import { toJSONSchema } from "zod";
import {
  createFrontendToolDefinition,
  type FrontendToolAvailability,
  type FrontendToolDefinition,
  type FrontendToolSafety,
} from "./frontend-tools.js";
import type { JsonValue } from "./json-value.js";

/** A frontend tool described by a zod schema (no handler — that's client-only). */
export interface EngentyFrontendToolSpec<TSchema extends z.ZodType> {
  /** Defaults to `"enabled"`. */
  availability?: FrontendToolAvailability;
  description: string;
  name: string;
  /** Module owner for tenant/effective-state gating; omitted for core tools. */
  owner_module_id?: string;
  /** Harness gating: `"safe"` runs directly, `"requires_confirmation"` is gated. */
  safety: FrontendToolSafety;
  schema: TSchema;
  title?: string;
}

/** Identity helper that captures the schema type for downstream handler inference. */
export function defineFrontendToolSpec<TSchema extends z.ZodType>(
  spec: EngentyFrontendToolSpec<TSchema>
): EngentyFrontendToolSpec<TSchema> {
  return spec;
}

/** Build the harness `FrontendToolDefinition` (agent-facing) from a zod spec. */
export function buildFrontendToolDefinitionFromZod(
  spec: EngentyFrontendToolSpec<z.ZodType>
): FrontendToolDefinition {
  // Strip `$schema` so generated parameters match hand-written definitions.
  const { $schema: _schema, ...parameters } = toJSONSchema(spec.schema) as {
    $schema?: unknown;
  } & Record<string, JsonValue>;
  return createFrontendToolDefinition({
    availability: spec.availability ?? "enabled",
    description: spec.description,
    name: spec.name,
    ...(spec.owner_module_id ? { owner_module_id: spec.owner_module_id } : {}),
    parameters,
    safety: spec.safety,
    ...(spec.title ? { title: spec.title } : {}),
  });
}
