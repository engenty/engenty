/**
 * The caller's OWN browser consent (PLAN-user-browser.md D3) — the person's,
 * tenant-wide, not a space's. Keyed on the token's user: nobody reads or
 * sets another person's, and a service principal has no browser (403).
 * A run inside a space gets the same row on the space surface; a run
 * outside any space reads it here.
 */
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  getUserBrowserGrant,
  upsertUserBrowserGrant,
} from "../../dal/user-browser-grants.js";
import { createDatabaseAdapter } from "../../infra/index.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireAuth } from "./authz.js";

const browserGrantBodySchema = z
  .object({
    autostart: z.boolean().optional(),
    unattended: z.boolean().optional(),
  })
  .refine(
    (body) => body.autostart !== undefined || body.unattended !== undefined,
    { message: "Nothing to set" }
  );

export function registerBrowserGrantRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  getTenantDb?: ((auth: { tenantId: string }) => SupabaseClient) | null;
}) {
  const { app, config } = params;

  function db(tenantId: string) {
    if (params.getTenantDb) {
      return params.getTenantDb({ tenantId });
    }
    const client = createDatabaseAdapter(config);
    if (!client) {
      throw new Error("browser_grant_routes_requires_database");
    }
    return client;
  }

  async function requireUser(c: Parameters<typeof requireAuth>[0]) {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return { error: authResult.error };
    }
    const tenantId = authResult.auth.tenantId;
    if (!tenantId) {
      return { error: jsonApiError(c, 403, { message: "No tenant" }) };
    }
    if (authResult.auth.principalType !== "user" || !authResult.auth.userId) {
      return { error: jsonApiError(c, 403, { message: "Not a user" }) };
    }
    return { tenantId, userId: authResult.auth.userId };
  }

  app.get("/api/me/browser-grant", async (c) => {
    const who = await requireUser(c);
    if ("error" in who) {
      return who.error;
    }
    const grant = await getUserBrowserGrant(
      db(who.tenantId),
      who.tenantId,
      who.userId
    );
    return jsonApiSuccess(c, {
      autostart: grant?.autostart ?? false,
      unattended: grant?.unattended ?? false,
    });
  });

  app.put("/api/me/browser-grant", async (c) => {
    const who = await requireUser(c);
    if ("error" in who) {
      return who.error;
    }
    const parsed = browserGrantBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return jsonApiError(c, 400, { message: "Invalid browser grant" });
    }
    const grant = await upsertUserBrowserGrant(
      db(who.tenantId),
      who.tenantId,
      who.userId,
      parsed.data
    );
    return jsonApiSuccess(c, {
      autostart: grant.autostart,
      unattended: grant.unattended,
    });
  });
}
