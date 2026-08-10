import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearImpersonationState,
  getImpersonationState,
  IMPERSONATION_STORAGE_KEY,
  isImpersonating,
  startImpersonation,
  stopImpersonation,
} from "./impersonation.js";

const getSession = vi.fn();
const setSession = vi.fn();
const signOut = vi.fn();

vi.mock("./api-client.js", () => ({
  getApiBaseUrl: () => "http://api.test",
}));

vi.mock("./supabase-auth-client.js", () => ({
  getSupabaseAuthClient: () => ({
    auth: {
      getSession,
      setSession,
      signOut,
    },
  }),
}));

function installMemorySessionStorage() {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
  vi.stubGlobal("sessionStorage", memoryStorage);
  return memoryStorage;
}

describe("impersonation session helper", () => {
  beforeEach(() => {
    installMemorySessionStorage();
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "admin-access",
          refresh_token: "admin-refresh",
          user: { id: "admin-1" },
        },
      },
      error: null,
    });
    setSession.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports not impersonating when storage is empty", () => {
    expect(isImpersonating()).toBe(false);
    expect(getImpersonationState()).toBeNull();
  });

  it("stashes the current session and swaps to the target", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "target-access",
        refresh_token: "target-refresh",
        actor: {
          id: "admin-1",
          email: "admin@example.com",
          display_name: "Admin",
        },
        target: {
          id: "member-1",
          email: "member@example.com",
          display_name: "Member",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await startImpersonation("member-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/auth/impersonate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ user_id: "member-1" }),
      })
    );
    expect(setSession).toHaveBeenCalledWith({
      access_token: "target-access",
      refresh_token: "target-refresh",
    });
    expect(isImpersonating()).toBe(true);
    expect(getImpersonationState()?.actor.email).toBe("admin@example.com");
    expect(getImpersonationState()?.target.id).toBe("member-1");
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeTruthy();
  });

  it("refuses nested impersonation", async () => {
    sessionStorage.setItem(
      IMPERSONATION_STORAGE_KEY,
      JSON.stringify({
        access_token: "a",
        refresh_token: "r",
        actor: { id: "a1", email: "a@x", display_name: null },
        target: { id: "t1", email: "t@x", display_name: null },
        started_at: new Date().toISOString(),
      })
    );
    await expect(startImpersonation("other")).rejects.toThrow(
      /Already impersonating/
    );
  });

  it("restores the stashed session on stop", async () => {
    sessionStorage.setItem(
      IMPERSONATION_STORAGE_KEY,
      JSON.stringify({
        access_token: "admin-access",
        refresh_token: "admin-refresh",
        actor: { id: "admin-1", email: "admin@example.com", display_name: "A" },
        target: { id: "member-1", email: "m@example.com", display_name: "M" },
        started_at: new Date().toISOString(),
      })
    );

    await stopImpersonation();

    expect(setSession).toHaveBeenCalledWith({
      access_token: "admin-access",
      refresh_token: "admin-refresh",
    });
    expect(isImpersonating()).toBe(false);
  });

  it("clears storage explicitly", () => {
    sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, "{}");
    clearImpersonationState();
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();
  });
});
