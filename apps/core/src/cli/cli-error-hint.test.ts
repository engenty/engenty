import { describe, expect, it } from "vitest";
import { CliApiError } from "./auth-sdk.js";
import { hintForError, isSupabaseUserToken } from "./cli-error-hint.js";

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part(claims)}.sig`;
}

describe("isSupabaseUserToken", () => {
  it("recognises the password-grant token by issuer or audience", () => {
    expect(
      isSupabaseUserToken(
        jwt({ aud: "authenticated", iss: "http://127.0.0.1:54321/auth/v1" })
      )
    ).toBe(true);
    expect(isSupabaseUserToken(jwt({ aud: ["authenticated"] }))).toBe(true);
    expect(
      isSupabaseUserToken(jwt({ aud: "engenty", iss: "engenty-core" }))
    ).toBe(false);
    expect(isSupabaseUserToken("not.a-jwt")).toBe(false);
    expect(isSupabaseUserToken(undefined)).toBe(false);
  });
});

describe("hintForError", () => {
  it("names the --dev token as the cause of a 401, not a missing login", () => {
    const error = new CliApiError('API 401: {"error":"Unauthorized"}', 401);
    const dev = hintForError(error, () =>
      jwt({ aud: "authenticated", iss: "http://127.0.0.1:54321/auth/v1" })
    );
    expect(dev).toContain("--dev");
    expect(dev).toContain("engenty auth login");
    expect(dev).toContain("service-token ensure-local");

    const principal = hintForError(error, () => jwt({ aud: "engenty" }));
    expect(principal).toContain("Not logged in");
    expect(hintForError(error, () => undefined)).toContain("Not logged in");
  });

  it("keeps the other hints", () => {
    expect(hintForError(new CliApiError("down", 0), () => undefined)).toContain(
      "Is the API running?"
    );
    expect(
      hintForError(new CliApiError("nope", 403), () => undefined)
    ).toContain("capabilities");
    expect(hintForError(new Error("x"), () => undefined)).toBeUndefined();
  });
});
