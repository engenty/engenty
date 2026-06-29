import { clearApiClient, setApiClient } from "@engenty/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteUsers,
  inviteUser,
  listUsers,
  updateUserProfile,
} from "./user-management-api.js";

describe("user management core API adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setApiClient({
      getAccessToken: async () => "session-token",
      getApiBaseUrl: () => "http://127.0.0.1:8787",
    });
  });

  afterEach(() => {
    clearApiClient();
  });

  it("maps core users payload to UI member model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: [
              {
                id: "u1",
                tenant_id: "tenant-1",
                email: "u1@example.com",
                display_name: "User One",
                role: "member",
                phone: null,
                initials: null,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const members = await listUsers();
    expect(members[0]?.display_name).toBe("User One");
    expect(members[0]?.email).toBe("u1@example.com");
  });

  it("uses core endpoints for create, unified patch update, and delete", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    await inviteUser({
      email: "new@example.com",
      password: "strong-password",
      display_name: "New User",
      role: "member",
    });
    await updateUserProfile("u2", {
      display_name: "Updated User",
      role: "member",
    });
    await deleteUsers(["u2"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/users",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer session-token",
        }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/users/u2",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer session-token",
        }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/users/u2",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer session-token",
        }),
      })
    );
  });

  it("throws the server envelope error when the request is unauthorized", async () => {
    setApiClient({
      getAccessToken: async () => null,
      getApiBaseUrl: () => "http://127.0.0.1:8787",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "unauthorized",
              message: "Unauthorized",
            },
          }),
          { status: 401, headers: { "content-type": "application/json" } }
        )
      )
    );

    await expect(listUsers()).rejects.toThrow("Unauthorized");
  });

  it("throws response text on non-2xx API responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("forbidden", {
          status: 403,
          headers: { "content-type": "text/plain" },
        })
      )
    );
    await expect(
      inviteUser({
        email: "new@example.com",
        password: "strong-password",
        display_name: "New User",
        role: "member",
      })
    ).rejects.toThrow("forbidden");
  });
});
