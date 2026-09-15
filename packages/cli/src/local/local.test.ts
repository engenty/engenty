import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  engentyHome,
  readInstallVersion,
  writeInstallVersion,
} from "../home.js";
import { buildHomeEnv } from "./local-env.js";
import {
  applyApiSchemas,
  applyLeanServices,
  buildStackConfig,
  credentialsFromStatus,
  MANAGED_PROJECT_ID,
  parseStatusEnv,
  readStackIdentity,
} from "./supabase-stack.js";

const CREDENTIALS = {
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_JWT_SECRET:
    "super-secret-jwt-token-with-at-least-32-characters-long",
  SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUPABASE_URL: "http://127.0.0.1:54321",
};

describe("engentyHome", () => {
  it("defaults to ~/.engenty", () => {
    expect(engentyHome({})).toBe(path.join(os.homedir(), ".engenty"));
  });

  it("honors ENGENTY_HOME", () => {
    expect(engentyHome({ ENGENTY_HOME: "/tmp/elsewhere" })).toBe(
      "/tmp/elsewhere"
    );
  });

  it("ignores a blank override", () => {
    expect(engentyHome({ ENGENTY_HOME: "  " })).toBe(
      path.join(os.homedir(), ".engenty")
    );
  });

  it("round-trips the install version", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-home-"));
    expect(readInstallVersion(dir)).toBeNull();
    writeInstallVersion("0.2.4", dir);
    expect(readInstallVersion(dir)).toBe("0.2.4");
  });
});

describe("config.toml rewriting", () => {
  it("replaces the managed schemas block", () => {
    const input = [
      "# >>> engenty:api-schemas (managed by `engenty generate`)",
      'schemas = ["public","graphql_public"]',
      "# <<< engenty:api-schemas",
    ].join("\n");
    expect(applyApiSchemas(input, ["public", "core", "ai"])).toContain(
      'schemas = ["public","core","ai"]'
    );
  });

  it("falls back to a bare schemas line", () => {
    expect(applyApiSchemas('schemas = ["public"]', ["public", "core"])).toBe(
      'schemas = ["public","core"]'
    );
  });

  it("turns studio, analytics and the edge runtime off", () => {
    const input = [
      "[studio]",
      "enabled = true",
      "port = 54323",
      "[analytics]",
      "enabled = true",
      "[edge_runtime]",
      "enabled = true",
      "[db]",
      "enabled = true",
    ].join("\n");
    const out = applyLeanServices(input);
    expect(out).toContain("[studio]\nenabled = false");
    expect(out).toContain("[analytics]\nenabled = false");
    expect(out).toContain("[edge_runtime]\nenabled = false");
    // Only the named sections move.
    expect(out).toContain("[db]\nenabled = true");
  });
});

describe("supabase status parsing", () => {
  const output = [
    'API_URL="http://127.0.0.1:54321"',
    'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
    'ANON_KEY="anon-key"',
    'JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"',
    'SERVICE_ROLE_KEY="service-key"',
  ].join("\n");

  it('reads KEY="value" lines', () => {
    expect(parseStatusEnv(output).ANON_KEY).toBe("anon-key");
  });

  it("maps them onto the compose variables", () => {
    expect(credentialsFromStatus(output)).toEqual(CREDENTIALS);
  });

  it("returns null when a key is missing", () => {
    expect(
      credentialsFromStatus('API_URL="http://127.0.0.1:54321"')
    ).toBeNull();
  });
});

describe("buildHomeEnv", () => {
  const params = {
    credentials: CREDENTIALS,
    internalDbUrl:
      "postgresql://postgres:postgres@host.docker.internal:54322/postgres?sslmode=disable",
    internalSupabaseUrl: "http://host.docker.internal:54321",
    port: 8787,
    sandboxDir: "/home/u/.engenty/sandboxes",
    spacesDir: "/home/u/.engenty/spaces",
  };

  it("fills what the compose file has no default for", () => {
    const text = buildHomeEnv("", params);
    expect(text).toContain("PUBLIC_APP_URL=http://localhost:8787");
    expect(text).toContain("SUPABASE_URL=http://host.docker.internal:54321");
    expect(text).toContain("VITE_SUPABASE_URL=http://127.0.0.1:54321");
    // The migrate container pushes against this; a host-side 127.0.0.1 would
    // point it at itself.
    expect(text).toContain(
      "SUPABASE_DB_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres?sslmode=disable"
    );
    expect(text).toMatch(/ENGENTY_SECURITY_JWT_SECRET=[0-9a-f]{64}/);
    expect(text).toContain("AI_GATEWAY_API_KEY=");
    // Without this the server lane signs with a secret the stack never saw.
    expect(text).toContain(
      "SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long"
    );
    // Host-side paths: apps/ai hands the sandbox one to the Docker daemon.
    expect(text).toContain(
      "ENGENTY_SANDBOX_HOST_DIR=/home/u/.engenty/sandboxes"
    );
    expect(text).toContain("ENGENTY_SPACES_HOST_DIR=/home/u/.engenty/spaces");
  });

  it("never rotates a secret on a rerun", () => {
    const first = buildHomeEnv("", params);
    const secret = first.match(/ENGENTY_SECURITY_JWT_SECRET=(\w+)/)?.[1];
    expect(buildHomeEnv(first, params)).toContain(
      `ENGENTY_SECURITY_JWT_SECRET=${secret}`
    );
  });

  it("keeps a value the operator set", () => {
    const edited = buildHomeEnv("AI_GATEWAY_API_KEY=sk-mine\n", params);
    expect(edited).toContain("AI_GATEWAY_API_KEY=sk-mine");
  });
});

describe("buildStackConfig", () => {
  const template = fs.readFileSync(
    path.join(import.meta.dirname, "../../../../supabase/config.toml.example"),
    "utf8"
  );

  it("claims its own project id and port band", async () => {
    const content = await buildStackConfig(template, {
      portOffset: 3000,
      schemas: ["public", "core"],
    });
    expect(content).toContain(`project_id = "${MANAGED_PROJECT_ID}"`);
    // The whole 543xx band moves together, so the api and db ports stay paired.
    expect(content).toMatch(/^port = 57321$/m);
    expect(content).toMatch(/^port = 57322$/m);
  });

  it("exposes the release's schemas and nothing else", async () => {
    const content = await buildStackConfig(template, {
      portOffset: 0,
      schemas: ["public", "core", "module_kb"],
    });
    expect(content).toContain('schemas = ["public","core","module_kb"]');
  });

  it("leaves the heavy services off", async () => {
    const content = await buildStackConfig(template, {
      portOffset: 0,
      schemas: ["public"],
    });
    for (const section of ["studio", "analytics", "edge_runtime"]) {
      // Comment lines sit between the header and the flag in the template.
      const block = content.split(`[${section}]`)[1] ?? "";
      const flag = block
        .split("\n")
        .find((line) => line.trim().startsWith("enabled"));
      expect(flag).toBe("enabled = false");
    }
  });

  it("is readable back as the install's identity", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-stack-"));
    fs.mkdirSync(path.join(home, "supabase"));
    fs.writeFileSync(
      path.join(home, "supabase", "config.toml"),
      await buildStackConfig(template, {
        portOffset: 2000,
        schemas: ["public"],
      })
    );
    expect(readStackIdentity(home)).toMatchObject({
      apiPort: 56_321,
      dbPort: 56_322,
      projectId: MANAGED_PROJECT_ID,
    });
  });
});

describe("withoutTls", () => {
  // Re-implemented here only because the helper is module-private; the rule it
  // encodes is what matters: a local push must not negotiate TLS.
  const withoutTls = (url: string) =>
    url.includes("sslmode=")
      ? url
      : `${url}${url.includes("?") ? "&" : "?"}sslmode=disable`;

  it("disables TLS on a bare local URL", () => {
    expect(
      withoutTls("postgresql://postgres:postgres@127.0.0.1:56322/postgres")
    ).toBe(
      "postgresql://postgres:postgres@127.0.0.1:56322/postgres?sslmode=disable"
    );
  });

  it("appends to an existing query string", () => {
    expect(withoutTls("postgresql://h/db?application_name=x")).toBe(
      "postgresql://h/db?application_name=x&sslmode=disable"
    );
  });

  it("leaves an explicit sslmode alone", () => {
    const url = "postgresql://h/db?sslmode=require";
    expect(withoutTls(url)).toBe(url);
  });
});
