// Structured execution report returned by the CLI Agent as its final message.
// The copilot presents the `summary` to the user and registers any `artifacts`
// that need user access with artifact_write { file }.

import { z } from "zod";

export const cliExecutionReportSchema = z.object({
  status: z.enum(["success", "error", "partial"]),
  exit_code: z.number().int(),
  // Human-readable explanation of what was done and key results.
  // The parent copilot relays this directly to the user.
  summary: z.string(),
  // Files promoted to /shared/cli-runs/{runId}/ (or other tenant storage paths).
  artifacts: z
    .array(
      z.object({
        key: z.string(), // tenant file-storage relative path under /shared
        name: z.string(),
        mime_type: z.string().optional(),
      })
    )
    .default([]),
  // Last ~20 lines of stderr — included only on error/partial to aid debugging.
  stderr_excerpt: z.string().optional(),
});

export type CliExecutionReport = z.infer<typeof cliExecutionReportSchema>;
