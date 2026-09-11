// Schemas for the App Build workflow. One envelope flows through every step so
// a failed build can short-circuit: `build_failed` carries the verbatim
// build_log and downstream steps pass the envelope through untouched. The
// sequence (ensure → commit → propose → publish) lives here as code precisely
// because a model cannot be trusted to remember it across approval
// interruptions — it created three duplicate apps trying.
import { z } from "zod";

export const appBuildInputSchema = z.object({
  /** Acting agent's type key, for honest created_by attribution on the app. */
  agent_type_key: z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  /** path -> source text. Written into the App's repository and committed. */
  files: z.record(z.string(), z.string()),
  /** Validated properly by core at the write boundary; opaque here. */
  manifest: z.record(z.string(), z.unknown()),
  /** The commit message. */
  message: z.string().max(500).optional(),
  name: z.string().min(1).max(120),
  /**
   * The artifact handle's session id. Defaults to `chat-<thread_id>` so two
   * builds in one chat share one working store.
   */
  session_id: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/)
    .optional(),
  tenant_id: z.string().uuid(),
  /** When present, the built App is published as an artifact in this thread. */
  thread_id: z.string().optional(),
});

export type AppBuildInput = z.infer<typeof appBuildInputSchema>;

export const appBuildStatusSchema = z.enum([
  "created",
  "written",
  /** Build green: a proposed version with a release exists, awaiting approval. */
  "built",
  /** esbuild/agentOS rejected the source; `build_log` is the agent's feedback. */
  "build_failed",
  "published",
]);

export const appBuildEnvelopeSchema = appBuildInputSchema.extend({
  app_id: z.string().uuid(),
  artifact_id: z.string().optional(),
  build_log: z.string().optional(),
  note: z.string().optional(),
  release: z.string().optional(),
  status: appBuildStatusSchema,
  version: z.number().int().optional(),
});

export type AppBuildEnvelope = z.infer<typeof appBuildEnvelopeSchema>;

/** What the app_build tool hands back to the agent. */
export const appBuildResultSchema = z.object({
  app_id: z.string().optional(),
  artifact_id: z.string().optional(),
  build_log: z.string().optional(),
  next_step: z.string(),
  status: appBuildStatusSchema,
  version: z.number().int().optional(),
});

export type AppBuildResult = z.infer<typeof appBuildResultSchema>;
