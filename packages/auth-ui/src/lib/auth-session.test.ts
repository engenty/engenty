import type { Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { isDeadRefreshTokenError, loadInitialSession } from "./auth-session";

describe("isDeadRefreshTokenError", () => {
  it("recognises Supabase's burnt-token answers by code and by message", () => {
    expect(
      isDeadRefreshTokenError({
        code: "refresh_token_already_used",
        message: "Invalid Refresh Token: Already Used",
      })
    ).toBe(true);
    expect(
      isDeadRefreshTokenError({
        code: undefined,
        message: "Invalid Refresh Token: Refresh Token Not Found",
      })
    ).toBe(true);
    expect(
      isDeadRefreshTokenError({ code: undefined, message: "Network error" })
    ).toBe(false);
  });
});

describe("loadInitialSession", () => {
  it("a burnt refresh token is forgotten locally and reads as signed out", async () => {
    const signOut = vi.fn(() => Promise.resolve({ error: null }));
    const result = await loadInitialSession({
      getSession: () =>
        Promise.resolve({
          data: { session: null },
          error: {
            code: "refresh_token_already_used",
            message: "Invalid Refresh Token: Already Used",
          },
        }),
      signOut,
    });
    expect(result).toEqual({ error: null, session: null });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("any other auth error still surfaces as a message", async () => {
    const result = await loadInitialSession({
      getSession: () =>
        Promise.resolve({
          data: { session: null },
          error: { code: "unexpected_failure", message: "Boom" },
        }),
      signOut: () => Promise.resolve(),
    });
    expect(result).toEqual({ error: "Boom", session: null });
  });

  it("a live session passes through untouched", async () => {
    const session = { access_token: "t" } as Session;
    const result = await loadInitialSession({
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      signOut: () => Promise.resolve(),
    });
    expect(result).toEqual({ error: null, session });
  });
});

describe("getAccessTokenFromClient", () => {
  it("a refresh that fails on a burnt token signs out locally and yields no bearer", async () => {
    const { getAccessTokenFromClient } = await import("./api-client");
    const signOut = vi.fn(() => Promise.resolve({ error: null }));
    const token = await getAccessTokenFromClient({
      auth: {
        getSession: () =>
          Promise.resolve({
            data: { session: null },
            error: {
              code: "refresh_token_already_used",
              message: "Invalid Refresh Token: Already Used",
            },
          }),
        signOut,
      },
    } as never);
    expect(token).toBeNull();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("the same when Supabase throws it instead of returning it", async () => {
    const { getAccessTokenFromClient } = await import("./api-client");
    const signOut = vi.fn(() => Promise.resolve({ error: null }));
    const token = await getAccessTokenFromClient({
      auth: {
        getSession: () =>
          Promise.reject(new Error("Invalid Refresh Token: Already Used")),
        signOut,
      },
    } as never);
    expect(token).toBeNull();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
