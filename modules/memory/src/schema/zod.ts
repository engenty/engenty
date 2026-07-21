import { z } from "zod";

export const memoryScopeKindSchema = z.enum([
  "user",
  "project",
  "org",
  "entity",
]);
export type MemoryScopeKind = z.infer<typeof memoryScopeKindSchema>;

export const memoryKindSchema = z.enum([
  "fact",
  "preference",
  "lesson",
  "decision",
  "guideline",
]);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const memorySourceKindSchema = z.enum(["agent", "reflection", "human"]);
export type MemorySourceKind = z.infer<typeof memorySourceKindSchema>;

export const memoryConfidenceSchema = z.enum(["low", "medium", "high"]);
export type MemoryConfidence = z.infer<typeof memoryConfidenceSchema>;

export const memoryStatusSchema = z.enum(["active", "proposed", "archived"]);
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

export const memorySlugSchema = z
  .string()
  .regex(
    /^[a-z0-9-]{3,60}$/,
    "slug must be 3-60 chars of lowercase letters, digits, and dashes"
  );

export const memoryRecordSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  scope_kind: memoryScopeKindSchema,
  scope_ref: z.string().nullable(),
  kind: memoryKindSchema,
  slug: z.string(),
  title: z.string(),
  body_md: z.string(),
  source_kind: memorySourceKindSchema,
  agent_type_key: z.string().nullable(),
  confidence: memoryConfidenceSchema,
  status: memoryStatusSchema,
  supersedes: z.string().nullable(),
  created_by: z.string().nullable(),
  /** Human editor of the last edit (provenance chip: "copilot · edited by you"). */
  updated_by: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;

export const memoryRecordUpsertInputSchema = z.object({
  scope_kind: memoryScopeKindSchema,
  scope_ref: z
    .string()
    .max(200)
    .optional()
    .describe(
      "user id / project id / '<type>:<id>' entity ref; omit for org scope"
    ),
  slug: memorySlugSchema,
  title: z.string().min(1).max(120),
  body_md: z.string().min(1).max(4000),
  kind: memoryKindSchema.default("fact"),
  confidence: memoryConfidenceSchema.default("medium"),
  source_kind: memorySourceKindSchema.optional(),
  supersedes: z.string().optional(),
  /** Audit attribution for agent writes (e.g. 'contacts.manager'). */
  agent_type_key: z.string().max(120).optional(),
  /**
   * Optimistic concurrency (document UI): the updated_at the editor loaded.
   * A mismatch fails the save with 'memory_record_conflict' instead of
   * silently clobbering a concurrent agent write.
   */
  expected_updated_at: z.string().optional(),
});
export type MemoryRecordUpsertInput = z.infer<
  typeof memoryRecordUpsertInputSchema
>;

export const memoryRecordListInputSchema = z
  .object({
    scope_kind: memoryScopeKindSchema.optional(),
    // Org scope is tenant-wide (scope_ref IS NULL). The document UI passes
    // `scope_ref: null` explicitly for the org tab, so null must be accepted
    // here — the DAL maps null → `.is("scope_ref", null)`. Rejecting null made
    // the org tab surface a validation error as a spurious "no access".
    scope_ref: z.string().nullable().optional(),
    kind: memoryKindSchema.optional(),
    status: memoryStatusSchema.optional(),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .optional();
export type MemoryRecordListInput = z.infer<typeof memoryRecordListInputSchema>;

export const memoryRecordArchiveInputSchema = z.object({
  id: z.string().min(1),
});
export type MemoryRecordArchiveInput = z.infer<
  typeof memoryRecordArchiveInputSchema
>;

/** Filter surface of the synthesized memory_record_search tool. */
export const memoryRecordSearchFiltersSchema = z
  .object({
    scope_kind: memoryScopeKindSchema.optional(),
    scope_ref: z.string().optional(),
    kind: memoryKindSchema.optional(),
  })
  .optional();
export type MemoryRecordSearchFilters = z.infer<
  typeof memoryRecordSearchFiltersSchema
>;
