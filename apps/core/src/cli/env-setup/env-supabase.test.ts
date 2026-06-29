import { describe, expect, it } from "vitest";
import {
  harvestSupabaseStatus,
  parseSupabaseStatusEnv,
  resolveSupabaseValue,
} from "./env-supabase.js";

// Shape of supabase CLI >= 2.x `status -o env` output (new sb_* key generation).
const CURRENT_OUTPUT = `ANON_KEY="eyJhbGciOiJIUzI1NiJ9.legacy-anon"
API_URL="http://127.0.0.1:54321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
JWT_SECRET="super-secret-jwt"
PUBLISHABLE_KEY="sb_publishable_abc123"
SECRET_KEY="sb_secret_def456"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiJ9.legacy-service"
`;

// Older CLI generations only emit the legacy JWT keys.
const LEGACY_OUTPUT = `ANON_KEY="eyJhbGciOiJIUzI1NiJ9.legacy-anon"
API_URL="http://127.0.0.1:54321"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiJ9.legacy-service"
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
    ).toBe("eyJhbGciOiJIUzI1NiJ9.legacy-service");
  });

  it("returns undefined when nothing matches", () => {
    expect(resolveSupabaseValue(["NOPE"], {})).toBeUndefined();
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
