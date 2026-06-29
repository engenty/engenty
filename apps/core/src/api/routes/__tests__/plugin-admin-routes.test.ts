import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listActiveAiRegistrations,
  registerAiRegistration,
  unregisterAiRegistration,
} from "@engenty/ai-core";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import type {
  PluginRecord,
  PluginRegistry,
} from "../../../plugins/registry.js";
import { registerPluginAdminRoutes } from "../plugins/plugin-admin-routes.js";

async function signSuperAdminToken() {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "service",
    token_type: "access",
    auth_method: "oauth",
    capabilities: ["core.superadmin"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("service-user")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `engenty-plugin-admin-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createPluginRecord(id: string): PluginRecord {
  return {
    id,
    source: `/plugins/${id}.ts`,
    cliCommands: [],
    dependencies: [],
    enabled: true,
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    loaded: true,
    manifestPath: `/plugins/${id}/engenty.plugin.json`,
    moduleOperations: [],
    queues: [],
    rootDir: `/plugins/${id}`,
    services: [],
    testDataTypes: [],
  };
}

describe("plugin admin routes", () => {
  let dataDir = "";

  afterEach(() => {
    unregisterAiRegistration("contacts");
    if (dataDir && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    dataDir = "";
  });

  it("unregisters AI registrations when deactivating a plugin", async () => {
    dataDir = createTempDir();

    registerAiRegistration({
      module_id: "contacts",
      agents: [
        {
          id: "contacts.manager",
          module_id: "contacts",
          name: "Contacts Manager",
          instruction_keys: [],
          build_tools: () => ({}),
        },
      ],
      actions: [],
      instruction_documents: [],
      skills: [],
      triggers: [
        {
          id: "contacts_enhance_trigger",
          moduleId: "contacts",
          routeKey: "enhance",
          triggerType: "button",
        },
      ],
    });

    const registry = {
      plugins: [createPluginRecord("contacts")],
      diagnostics: [],
    } as unknown as PluginRegistry;

    const app = new OpenAPIHono();
    registerPluginAdminRoutes({
      app,
      registry,
      dataDir,
      config: { securityJwtSecret: "test-secret" },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      resolvePath: (item) => path.resolve(dataDir, item),
    });

    const token = await signSuperAdminToken();
    const response = await app.request("/api/plugins/contacts/deactivate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(
      listActiveAiRegistrations().some(
        (registration) => registration.module_id === "contacts"
      )
    ).toBe(false);
  });
});
