import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRuntimeContextInstructions } from "./runtime-context.js";

describe("buildRuntimeContextInstructions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("includes the authenticated user's profile from workspace context", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "http://core.local");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        if (url.pathname === "/api/users/setup/context") {
          return Response.json({
            ok: true,
            data: {
              canSwitchTenant: false,
              currentTenant: { id: "tenant-1", name: "Acme", slug: "acme" },
              currentUser: {
                id: "user-1",
                email: "ada@example.com",
                display_name: "Ada Lovelace",
                initials: "AL",
                role: "admin",
              },
              isSuperAdmin: false,
              isTenantAdmin: true,
              onboarded: true,
              tenantRole: "admin",
              tenantSupportedLocales: ["en", "de"],
              tenants: [{ id: "tenant-1", name: "Acme", slug: "acme" }],
              userId: "user-1",
            },
          });
        }
        return Response.json({ ok: true, data: [] });
      })
    );

    const result = await buildRuntimeContextInstructions({
      scope: {
        tenantId: "tenant-1",
        userId: "user-1",
        userAccessToken: "token-1",
        isSuperAdmin: false,
        isTenantAdmin: true,
        tenantRole: "admin",
      },
      threadId: "session-1",
    });

    expect(result).toContain(
      "- current_user: name=Ada Lovelace, email=ada@example.com, initials=AL, role=admin, id=user-1"
    );
  });
});
