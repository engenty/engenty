/**
 * A Space's browser consent (PLAN-user-browser.md D3;
 * PLAN-space-owned-connections.md): every person who can enter the Space may
 * read it; only the Space's owners — or a tenant admin — may change it,
 * because it decides what the Space's agents do with its shared logins while
 * nobody watches. A Space the caller cannot enter is 404, like every other
 * space-scoped route.
 */

import { capabilityCovers } from "@engenty/plugin-sdk";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  getSpaceBrowserGrant,
  upsertSpaceBrowserGrant,
} from "../../dal/space-browser-grants.js";
import {
  findAccessibleSpace,
  isSpaceOwner,
} from "../../dal/space-membership.js";
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

  async function requireSpaceMember(
    c: Parameters<typeof requireAuth>[0],
    spaceIdOrKey: string
  ) {
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
    const space = await findAccessibleSpace(
      db(tenantId),
      tenantId,
      authResult.auth.userId,
      spaceIdOrKey
    );
    if (!space) {
      return { error: jsonApiError(c, 404, { message: "Space not found" }) };
    }
    return {
      capabilities: authResult.auth.capabilities ?? [],
      spaceId: space.id,
      tenantId,
      userId: authResult.auth.userId,
    };
  }

  app.get("/api/spaces/:spaceId/browser-grant", async (c) => {
    const who = await requireSpaceMember(c, c.req.param("spaceId"));
    if ("error" in who) {
      return who.error;
    }
    const grant = await getSpaceBrowserGrant(
      db(who.tenantId),
      who.tenantId,
      who.spaceId
    );
    return jsonApiSuccess(c, {
      autostart: grant?.autostart ?? false,
      unattended: grant?.unattended ?? false,
    });
  });

  app.put("/api/spaces/:spaceId/browser-grant", async (c) => {
    const who = await requireSpaceMember(c, c.req.param("spaceId"));
    if ("error" in who) {
      return who.error;
    }
    if (
      !(
        capabilityCovers([...who.capabilities], "core.users.manage") ||
        (await isSpaceOwner(
          db(who.tenantId),
          who.tenantId,
          who.spaceId,
          who.userId
        ))
      )
    ) {
      return jsonApiError(c, 403, {
        message:
          "Only the space's owners (or a tenant admin) can change what its agents may do with its browser.",
      });
    }
    const parsed = browserGrantBodySchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return jsonApiError(c, 400, { message: "Invalid browser grant" });
    }
    const grant = await upsertSpaceBrowserGrant(
      db(who.tenantId),
      who.tenantId,
      who.spaceId,
      { ...parsed.data, updatedBy: who.userId }
    );
    return jsonApiSuccess(c, {
      autostart: grant.autostart,
      unattended: grant.unattended,
    });
  });
}
