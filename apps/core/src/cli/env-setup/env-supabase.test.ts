import { describe, expect, it } from "vitest";
import {
  harvestSupabaseStatus,
  parseSupabaseStatusEnv,
  resolveSupabaseValue,
} from "./env-supabase.js";

// 3-part HS256 JWT stubs, matching the shape of the real legacy ANON/SERVICE keys.
const LEGACY_ANON = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.legacy-anon-sig";
const LEGACY_SERVICE =
  "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.legacy-service-sig";

// Shape of supabase CLI >= 2.x `status -o env` output (new sb_* key generation).
const CURRENT_OUTPUT = `ANON_KEY="${LEGACY_ANON}"
API_URL="http://127.0.0.1:54321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
JWT_SECRET="super-secret-jwt"
PUBLISHABLE_KEY="sb_publishable_abc123"
SECRET_KEY="sb_secret_def456"
SERVICE_ROLE_KEY="${LEGACY_SERVICE}"
`;

// Older CLI generations only emit the legacy JWT keys.
const LEGACY_OUTPUT = `ANON_KEY="${LEGACY_ANON}"
API_URL="http://127.0.0.1:54321"
SERVICE_ROLE_KEY="${LEGACY_SERVICE}"
`;

describe("parseSupabaseStatusEnv", () => {
  it("parses quoted KEY=VALUE lines", () => {
    const values = parseSupabaseStatusEnv(CURRENT_OUTPUT);
    expect(values.API_URL).toBe("http://127.0.0.1:54321");
    expect(values.SECRET_KEY).toBe("sb_secret_def456");
  });

  it("ignores blank lines and comments", () => {
    expect(parseSupabaseStatusEnv("\n# comment\nA=1\n")).toEqual({ A: "1" });
  });
});

describe("resolveSupabaseValue", () => {
  it("prefers the new sb_* key names", () => {
    const values = parseSupabaseStatusEnv(CURRENT_OUTPUT);
    expect(
      resolveSupabaseValue(["SECRET_KEY", "SERVICE_ROLE_KEY"], values)
    ).toBe("sb_secret_def456");
    expect(resolveSupabaseValue(["PUBLISHABLE_KEY", "ANON_KEY"], values)).toBe(
      "sb_publishable_abc123"
    );
  });

  it("falls back to legacy key names", () => {
    const values = parseSupabaseStatusEnv(LEGACY_OUTPUT);
    expect(
      resolveSupabaseValue(["SECRET_KEY", "SERVICE_ROLE_KEY"], values)
    ).toBe(LEGACY_SERVICE);
  });

  it("returns undefined when nothing matches", () => {
    expect(resolveSupabaseValue(["NOPE"], {})).toBeUndefined();
  });

  it("with preferJwt, picks the legacy JWT over the new sb_* key", () => {
    const values = parseSupabaseStatusEnv(CURRENT_OUTPUT);
    expect(
      resolveSupabaseValue(["SECRET_KEY", "SERVICE_ROLE_KEY"], values, {
        preferJwt: true,
      })
    ).toBe(LEGACY_SERVICE);
    expect(
      resolveSupabaseValue(["PUBLISHABLE_KEY", "ANON_KEY"], values, {
        preferJwt: true,
      })
    ).toBe(LEGACY_ANON);
  });

  it("with preferJwt, falls back to first non-empty when no JWT is present", () => {
    expect(
      resolveSupabaseValue(
        ["API_URL"],
        { API_URL: "http://127.0.0.1:54321" },
        { preferJwt: true }
      )
    ).toBe("http://127.0.0.1:54321");
  });
});

describe("harvestSupabaseStatus", () => {
  it("returns parsed values from an injected runner", async () => {
    const result = await harvestSupabaseStatus(() =>
      Promise.resolve({ code: 0, stderr: "", stdout: CURRENT_OUTPUT })
    );
    expect(result.ok).toBe(true);
    expect(result.values.API_URL).toBe("http://127.0.0.1:54321");
  });

  it("degrades with a hint when the stack is down", async () => {
    const result = await harvestSupabaseStatus(() =>
      Promise.resolve({
        code: 1,
        stderr: "supabase start is not running.",
        stdout: "",
      })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not running");
  });

  it("degrades when the CLI is missing entirely", async () => {
    const result = await harvestSupabaseStatus(() =>
      Promise.reject(new Error("spawn supabase ENOENT"))
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ENOENT");
  });
});
