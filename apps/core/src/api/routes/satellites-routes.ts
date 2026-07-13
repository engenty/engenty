import type { OpenAPIHono } from "@hono/zod-openapi";
import { probeSatellite } from "../../dal/satellite-health.js";
import {
  createSatellitesDal,
  type SatelliteStatus,
} from "../../dal/satellites.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

const SATELLITE_STATUSES: SatelliteStatus[] = [
  "provisioning",
  "active",
  "suspended",
  "error",
  "archived",
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Superadmin routes for the satellite registry (docs/wip/manage-app.md §7.1).
 * CRUD over `core.satellites` plus an on-demand health probe. `createDal` is
 * injectable for tests. Provisioning/lifecycle and the Management-API facade
 * build on top of this registry.
 */
export function registerSatellitesRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  createDal?: typeof createSatellitesDal;
}) {
  const { app, config } = params;
  const dal = (params.createDal ?? createSatellitesDal)(config);

  app.get("/api/superadmin/satellites", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    return jsonApiSuccess(c, { satellites: await dal.listSatellites() });
  });

  app.get("/api/superadmin/satellites/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const satellite = await dal.getSatellite(c.req.param("id"));
    if (!satellite) {
      return jsonApiError(c, 404, { message: "Satellite not found" });
    }
    return jsonApiSuccess(c, satellite);
  });

  app.post("/api/superadmin/satellites", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      slug?: string;
      tenant_id?: string | null;
      endpoints?: Record<string, string>;
      pinned_version?: string | null;
    };
    if (!body.name) {
      return jsonApiError(c, 400, { message: "name is required" });
    }
    const satellite = await dal.createSatellite({
      name: body.name,
      slug: body.slug?.trim() || slugify(body.name),
      tenant_id: body.tenant_id ?? null,
      endpoints: body.endpoints ?? {},
      pinned_version: body.pinned_version ?? null,
    });
    return jsonApiSuccess(c, satellite);
  });

  app.patch("/api/superadmin/satellites/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      status?: string;
      endpoints?: Record<string, string>;
      pinned_version?: string | null;
    };
    if (
      body.status !== undefined &&
      !SATELLITE_STATUSES.includes(body.status as SatelliteStatus)
    ) {
      return jsonApiError(c, 400, {
        message: `status must be one of: ${SATELLITE_STATUSES.join(", ")}`,
      });
    }
    const satellite = await dal.updateSatellite(c.req.param("id"), {
      name: body.name,
      status: body.status as SatelliteStatus | undefined,
      endpoints: body.endpoints,
      pinned_version: body.pinned_version,
    });
    return jsonApiSuccess(c, satellite);
  });

  app.delete("/api/superadmin/satellites/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    await dal.deleteSatellite(c.req.param("id"));
    return jsonApiSuccess(c, { deleted: true });
  });

  // Probe the satellite's API and persist the result.
  app.post("/api/superadmin/satellites/:id/health", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const id = c.req.param("id");
    const satellite = await dal.getSatellite(id);
    if (!satellite) {
      return jsonApiError(c, 404, { message: "Satellite not found" });
    }
    const health = await probeSatellite(satellite.endpoints);
    await dal.setSatelliteHealth(id, health);
    return jsonApiSuccess(c, { health });
  });
}
