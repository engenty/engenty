import { describe, expect, it, vi } from "vitest";
import {
  ensureCurrentWorkspaceUser,
  initializeWorkspaceAdmin,
  isInitialSetupRequired,
} from "./initial-setup";

const API_BASE = "http://127.0.0.1:8787";

vi.mock("./api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api-client")>();
  return {
    ...actual,
    getApiBaseUrl: () => API_BASE,
  };
});

vi.mock("./supabase-session-claims", () => ({
  refreshSupabaseAuthSession: vi.fn().mockResolvedValue({
    access_token: "refreshed-token",
  }),
}));

describe("initial setup core API integration", () => {
  it("reads setup status from core endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { initialSetupRequired: true, usersCount: 0 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const required = await isInitialSetupRequired();
    expect(required).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/users/setup/status`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("initializes admin through core endpoint with bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "session-token" } },
        }),
      },
    };

    await initializeWorkspaceAdmin(supabase as never);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/users/setup/initialize-admin`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer session-token",
          "content-type": "application/json",
        },
      }
    );
  });

  it("ensures current user through core endpoint with bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "session-token" } },
        }),
      },
    };

    await ensureCurrentWorkspaceUser(supabase as never);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/users/setup/ensure-current-user`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer session-token",
          "content-type": "application/json",
        },
      }
    );
  });

  it("throws when initialize admin is called without a session token", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
        }),
      },
    };
    await expect(initializeWorkspaceAdmin(supabase as never)).rejects.toThrow(
      "Not authenticated."
    );
  });

  it("throws response body when ensure current user endpoint fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("denied", {
        status: 403,
        headers: { "content-type": "text/plain" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "session-token" } },
        }),
      },
    };

    await expect(ensureCurrentWorkspaceUser(supabase as never)).rejects.toThrow(
      "denied"
    );
  });

  it("throws structured API error message for stale session responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "unauthorized",
            message: "Session from session_id claim in JWT does not exist",
          },
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "session-token" } },
        }),
      },
    };

    await expect(ensureCurrentWorkspaceUser(supabase as never)).rejects.toThrow(
      "Session from session_id claim in JWT does not exist"
    );
  });
});
