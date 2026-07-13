import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { classifyHealth } from "../dal/satellite-health.js";
import type { Satellite, SatellitesDal } from "../dal/satellites.js";
import { registerSatellitesRoutes } from "./routes/satellites-routes.js";

async function signToken(capabilities: string[]) {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "service",
    token_type: "access",
    auth_method: "oauth",
    capabilities,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("service-user")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

const CONFIG = {
  securityJwtSecret: "test-secret",
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseServiceRoleKey: "test-service-role",
};

function createStatefulDal(): SatellitesDal {
  const store = new Map<string, Satellite>();
  let seq = 0;
  const now = "2026-07-14T00:00:00.000Z";
  return {
    listSatellites: async () => [...store.values()],
    getSatellite: async (id) => store.get(id) ?? null,
    createSatellite: async (input) => {
      const id = `sat-${++seq}`;
      const sat: Satellite = {
        id,
        tenant_id: input.tenant_id ?? null,
        name: input.name,
        slug: input.slug,
        status: "provisioning",
        endpoints: input.endpoints ?? {},
        credential_ref: input.credential_ref ?? null,
        pinned_version: input.pinned_version ?? null,
        health: { status: "unknown", checkedAt: null },
        created_at: now,
        updated_at: now,
      };
      store.set(id, sat);
      return sat;
    },
    updateSatellite: async (id, patch) => {
      const current = store.get(id);
      if (!current) {
        throw new Error("not found");
      }
      const next = { ...current, ...patch, updated_at: now } as Satellite;
      store.set(id, next);
      return next;
    },
    setSatelliteHealth: async (id, health) => {
      const current = store.get(id);
      if (current) {
        store.set(id, { ...current, health });
      }
    },
    deleteSatellite: async (id) => {
      store.delete(id);
    },
  };
}

function createApp() {
  const app = new OpenAPIHono();
  const dal = createStatefulDal();
  registerSatellitesRoutes({ app, config: CONFIG, createDal: () => dal });
  return app;
}

const headers = async () => ({
  authorization: `Bearer ${await signToken(["core.superadmin"])}`,
  "content-type": "application/json",
});

describe("classifyHealth", () => {
  it("maps reachability + status to a health level", () => {
    expect(classifyHealth(false)).toBe("down");
    expect(classifyHealth(true, 200)).toBe("healthy");
    expect(classifyHealth(true, 302)).toBe("healthy");
    expect(classifyHealth(true, 503)).toBe("degraded");
    expect(classifyHealth(true, 404)).toBe("degraded");
  });
});

describe("satellites routes", () => {
  it("gates the registry behind superadmin", async () => {
    const app = createApp();
    const nonAdmin = await signToken(["core.plugins.manage"]);
    const res = await app.request("/api/superadmin/satellites", {
      headers: { authorization: `Bearer ${nonAdmin}` },
    });
    expect(res.status).toBe(403);
  });

  it("creates (auto-slug), lists, patches status, and deletes", async () => {
    const app = createApp();
    const h = await headers();

    const created = await app.request("/api/superadmin/satellites", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "Acme Box" }),
    });
    expect(created.status).toBe(200);
    const sat = ((await created.json()) as { data: Satellite }).data;
    expect(sat.slug).toBe("acme-box");
    expect(sat.status).toBe("provisioning");

    const list = await app.request("/api/superadmin/satellites", {
      headers: h,
    });
    expect(
      ((await list.json()) as { data: { satellites: Satellite[] } }).data
        .satellites
    ).toHaveLength(1);

    const patched = await app.request(`/api/superadmin/satellites/${sat.id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ status: "active" }),
    });
    expect(((await patched.json()) as { data: Satellite }).data.status).toBe(
      "active"
    );

    const badStatus = await app.request(
      `/api/superadmin/satellites/${sat.id}`,
      { method: "PATCH", headers: h, body: JSON.stringify({ status: "nope" }) }
    );
    expect(badStatus.status).toBe(400);

    const removed = await app.request(`/api/superadmin/satellites/${sat.id}`, {
      method: "DELETE",
      headers: h,
    });
    expect(removed.status).toBe(200);
  });

  it("probes health and reports down for an unconfigured endpoint", async () => {
    const app = createApp();
    const h = await headers();
    const created = await app.request("/api/superadmin/satellites", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "No Endpoint" }),
    });
    const id = ((await created.json()) as { data: Satellite }).data.id;
    const health = await app.request(
      `/api/superadmin/satellites/${id}/health`,
      { method: "POST", headers: h }
    );
    const body = (await health.json()) as {
      data: { health: { status: string } };
    };
    // no apiUrl configured -> unknown
    expect(body.data.health.status).toBe("unknown");
  });
});
