import { z } from "zod";
import { runImportCleanup } from "./import-cleanup-route.js";

export const CLEANUP_CSV_TOOL_ID = "cleanup_csv";

const cleanupCsvInputSchema = z.object({
  csv_text: z
    .string()
    .min(1)
    .describe("Raw CSV/TSV text to clean (may include broken line breaks)"),
  domain_hint: z
    .string()
    .optional()
    .describe("Optional domain hint such as contacts, team, or secrets"),
  use_ai_headers: z
    .boolean()
    .optional()
    .describe(
      "When true (default), use a lightweight LLM to name columns if no header row was present"
    ),
});

interface CleanupCsvToolDefinition {
  description: string;
  execute: (
    input: z.infer<typeof cleanupCsvInputSchema>
  ) => Promise<Record<string, unknown>>;
  id: string;
  inputSchema: typeof cleanupCsvInputSchema;
}

const cleanupCsvToolDescription =
  "Clean and normalize CSV/TSV text before import: fix mixed line endings, " +
  "repair unquoted multiline fields, drop empty trailing columns, synthesize " +
  "or AI-suggest headers when missing, and return cleaned CSV plus a change report. " +
  "Prefer this before mapping or importing messy exports (e.g. accounting/CRM dumps).";

export function buildCleanupCsvTool<TTool>(
  createTool: (definition: CleanupCsvToolDefinition) => TTool
): TTool {
  return createTool({
    id: CLEANUP_CSV_TOOL_ID,
    description: cleanupCsvToolDescription,
    inputSchema: cleanupCsvInputSchema,
    execute: async ({ csv_text, domain_hint, use_ai_headers }) => {
      try {
        const result = await runImportCleanup({
          csvText: csv_text,
          domainHint: domain_hint,
          useAiHeaders: use_ai_headers,
        });
        return {
          ok: true,
          cleaned_csv: result.cleanedContent,
          headers: result.headers,
          row_count: result.rowCount,
          delimiter: result.delimiter,
          changes: result.changes,
          issues: result.issues,
          used_ai_headers: result.usedAiHeaders,
          suggest_ai_headers: result.suggestAiHeaders,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
