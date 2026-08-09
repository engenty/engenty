/**
 * Build an Engenty API GET tool for use by specialists (e.g. widget generation, agentic runtime).
 * The host injects a request function so ai-core stays free of Hono/HTTP.
 */
import { type Tool, tool } from "ai";
import { z } from "zod";

/** Scope key for injecting the API request function. Set by the route when calling runAgentOnce. */
export const ENGENTY_API_REQUEST_SCOPE_KEY = "_engentyApiRequest" as const;

export const engentyApiInputSchema = z.object({
  path: z.string().min(1).meta({
    description:
      "API path, e.g. /api/users/u-self, /api/team, /api/invoices, /api/contacts",
  }),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .meta({
      description:
        "Query params, e.g. { pageSize: 5, sortBy: 'created_at', sortOrder: 'desc' }",
    }),
  contextKey: z.string().min(1).meta({
    description:
      "Key for widget context (JSON Pointer root), e.g. user, teamMembers, invoices, overdueInvoices",
  }),
});

/** Receives pathname + search (e.g. "/api/team?pageSize=5"). Returns response data or { error: string }. */
export type EngentyApiRequestFn = (pathAndSearch: string) => Promise<unknown>;

export interface BuildEngentyApiToolParams {
  /** Optional tool description override. */
  description?: string;
  /**
   * Perform a GET request. Return the response data (e.g. unwrapped from { data }).
   * Return { error: string } or throw on failure.
   */
  request: EngentyApiRequestFn;
}

const defaultDescription =
  "Fetch data from Engenty API. Use for: current user (/api/users/u-self), team members (/api/team), invoices (/api/invoices), contacts (/api/contacts). Set contextKey to the state path root (e.g. user, teamMembers, invoices). Add params for pagination/sorting.";

export function buildEngentyApiTool(params: BuildEngentyApiToolParams): Tool {
  const { request, description = defaultDescription } = params;

  return tool({
    description,
    inputSchema: engentyApiInputSchema,
    execute: async (input: unknown): Promise<unknown> => {
      const parsed = engentyApiInputSchema.safeParse(input);
      if (!parsed.success) {
        return { error: parsed.error.message };
      }
      const {
        path,
        params: queryParams,
        contextKey: _contextKey,
      } = parsed.data;
      const url = new URL(path, "http://localhost");
      if (queryParams && Object.keys(queryParams).length > 0) {
        for (const [k, v] of Object.entries(queryParams)) {
          url.searchParams.set(k, String(v));
        }
      }
      try {
        const result = await request(url.pathname + url.search);
        if (
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof (result as { error: unknown }).error === "string"
        ) {
          return { error: (result as { error: string }).error };
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: msg };
      }
    },
  });
}
