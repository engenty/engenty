import { z } from "@hono/zod-openapi";
import {
  applyCsvHeaders,
  type CsvCleanupIssue,
  cleanupCSV,
} from "../cleanup-csv.js";
import { inferCsvHeaders } from "./infer-csv-headers.js";

const importFieldHintSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

const importCleanupInputSchema = z.object({
  csvText: z.string().min(1),
  domainHint: z.string().optional(),
  fieldHints: z.array(importFieldHintSchema).optional(),
  /** When true (default), run a lightweight LLM header pass if headers were synthesized. */
  useAiHeaders: z.boolean().optional().default(true),
});

const cleanupIssueSchema = z.object({
  code: z.string(),
  detail: z.string().optional(),
});

const importCleanupOutputSchema = z.object({
  changes: z.array(cleanupIssueSchema),
  cleanedContent: z.string(),
  delimiter: z.enum([",", ";", "\t"]),
  headers: z.array(z.string()),
  issues: z.array(cleanupIssueSchema),
  rowCount: z.number().int().nonnegative(),
  suggestAiHeaders: z.boolean(),
  usedAiHeaders: z.boolean(),
});

export type ImportCleanupResult = z.infer<typeof importCleanupOutputSchema>;

export interface ImportCleanupRouteRegistrar {
  registerHttpRoute: (route: {
    handler: (ctx: {
      body?: unknown;
      request: Request;
    }) => Promise<unknown | Response>;
    method: "post";
    operation: {
      idempotent?: boolean;
      requiredCapabilities: string[];
      riskLevel: string;
    };
    path: string;
    request: { body: typeof importCleanupInputSchema };
    responses: Record<
      number,
      { description: string; schema: typeof importCleanupOutputSchema }
    >;
    summary: string;
    tags: string[];
  }) => void;
}

export interface RegisterImportCleanupRouteOptions {
  domainHint?: string;
  path: string;
  requiredCapabilities: string[];
  tags: string[];
}

function toIssueList(issues: CsvCleanupIssue[]) {
  return issues.map((issue) => ({
    code: issue.code,
    detail: issue.detail,
  }));
}

export async function runImportCleanup(input: {
  csvText: string;
  domainHint?: string;
  fieldHints?: Array<{ key: string; label: string; description?: string }>;
  useAiHeaders?: boolean;
}): Promise<ImportCleanupResult> {
  let result = cleanupCSV(input.csvText);
  let usedAiHeaders = false;

  if (
    input.useAiHeaders !== false &&
    result.suggestAiHeaders &&
    result.headers.length > 0
  ) {
    try {
      const inferred = await inferCsvHeaders({
        columnCount: result.headers.length,
        domainHint: input.domainHint,
        fieldHints: input.fieldHints,
        sampleRows: result.parsed.rows.slice(0, 8),
      });
      if (inferred) {
        result = applyCsvHeaders(result, inferred);
        usedAiHeaders = true;
      }
    } catch {
      // Deterministic cleanup still succeeds when AI is unavailable.
    }
  }

  return {
    cleanedContent: result.cleanedContent,
    delimiter: result.delimiter,
    headers: result.headers,
    rowCount: result.rowCount,
    issues: toIssueList(result.issues),
    changes: toIssueList(result.changes),
    suggestAiHeaders: result.suggestAiHeaders,
    usedAiHeaders,
  };
}

export function registerImportCleanupRoute(
  api: ImportCleanupRouteRegistrar,
  options: RegisterImportCleanupRouteOptions
) {
  api.registerHttpRoute({
    method: "post",
    path: options.path,
    operation: {
      requiredCapabilities: options.requiredCapabilities,
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Clean and normalize a CSV before import mapping",
    tags: options.tags,
    request: { body: importCleanupInputSchema },
    responses: {
      200: {
        description: "Cleaned CSV text plus issue report",
        schema: importCleanupOutputSchema,
      },
    },
    handler: async (ctx) => {
      const body = importCleanupInputSchema.parse(ctx.body ?? {});
      try {
        return await runImportCleanup({
          csvText: body.csvText,
          domainHint: body.domainHint ?? options.domainHint,
          fieldHints: body.fieldHints,
          useAiHeaders: body.useAiHeaders,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "CSV cleanup failed";
        return new Response(JSON.stringify({ error: message }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });
}
