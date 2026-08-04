import type { EngentyApiRequestFn } from "@engenty/ai-core";
import { isApiError, isApiSuccess } from "@engenty/api-contracts";
import { dashboardJsonUiConfigSchema } from "@engenty/dashboard-core";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import type { PluginRegistry } from "../../../plugins/registry.js";

export interface RegisterDashboardParams {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  dataDir: string;
  registry: PluginRegistry;
  resolvePath: (p: string) => string;
}

export const requestSchema = z.object({
  prompt: z.string().min(10).max(1000),
  title: z.string().max(120).optional(),
  /** When true (default), creation may define optional agentic runtime output. */
  useAgentic: z.boolean().optional().default(true),
});

export const runtimeRequestSchema = z.object({
  widgetId: z.string().min(1),
  config: dashboardJsonUiConfigSchema,
  forceRefresh: z.boolean().optional().default(false),
});

export function buildDashboardRequestFn(params: {
  app: OpenAPIHono;
  authHeader: string;
}): EngentyApiRequestFn {
  const { app, authHeader } = params;
  return async (pathAndSearch) => {
    const res = await app.request(pathAndSearch, {
      method: "GET",
      headers: {
        authorization: authHeader || "Bearer anonymous",
        "content-type": "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: `API ${res.status}: ${text.slice(0, 200)}` };
    }
    const payload = (await res.json()) as unknown;
    if (isApiError(payload)) {
      return { error: payload.error.message };
    }
    if (isApiSuccess(payload)) {
      return payload.data;
    }
    return payload;
  };
}
