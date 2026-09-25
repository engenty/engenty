import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSpaceSurface = vi.fn(async (_spaceId: string) => ({}));
vi.mock("../../ai/core-http-client.js", () => ({
  EngentyCoreClient: class {
    getSpaceSurface = getSpaceSurface;
  },
  getEngentyCoreBaseUrlFromEnv: () => "http://core.test",
}));

const readUserBrowserStatus = vi.fn(
  async (identity: { spaceId: string; tenantId: string }) => ({
    sandboxId: `engenty-browser-${identity.tenantId}-${identity.spaceId}`,
    state: "running" as const,
  })
);
vi.mock("../../ai/sandbox/space-browser.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../ai/sandbox/space-browser.js")
  >()),
  readUserBrowserStatus: (identity: { spaceId: string; tenantId: string }) =>
    readUserBrowserStatus(identity),
  startUserBrowser: vi.fn(),
  stopUserBrowser: vi.fn(),
}));

const resolvePersonalSpaceId = vi.fn(async () => PERSONAL_SPACE);
vi.mock("../../ai/sessions/run-space.js", () => ({
  resolvePersonalSpaceId: () => resolvePersonalSpaceId(),
}));

import { verifyBrowserTicket } from "../browser/browser-tickets.js";
import { registerSandboxRoutes } from "../sandbox-routes.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";
const USER = "00000000-0000-4000-8000-00000000000c";
const PERSONAL_SPACE = "00000000-0000-4000-8000-0000000000b1";
const SPACE = "00000000-0000-4000-8000-0000000000b2";
const FOREIGN_SPACE = "00000000-0000-4000-8000-0000000000b3";

function build() {
  const app = new Hono();
  registerSandboxRoutes(app as never, {
    browserTicketSecret: "secret",
    getSessionStore: () => null,
    scopeResolver: async () => ({
      ok: true as const,
      scope: {
        capabilities: ["*"],
        credential: { kind: "user" as const, token: "tok" },
        isSuperAdmin: false,
        isTenantAdmin: false,
        tenantId: TENANT,
        tenantRole: "member" as const,
        userId: USER,
      },
    }),
  });
  return app;
}

const request = (app: Hono, path: string, method = "GET") =>
  app.request(path, { headers: { authorization: "Bearer tok" }, method });

describe("Space browser routes", () => {
  beforeEach(() => {
    getSpaceSurface.mockReset();
    getSpaceSurface.mockImplementation(async (spaceId: string) => {
      if (spaceId === FOREIGN_SPACE) {
        throw new Error("403 forbidden");
      }
      return {};
    });
    readUserBrowserStatus.mockClear();
  });

  it("refuses a Space the caller is not a member of", async () => {
    const app = build();
    const status = await request(
      app,
      `/ai/sandboxes/browser?space_id=${FOREIGN_SPACE}`
    );
    expect(status.status).toBe(403);
    const ticket = await request(
      app,
      `/ai/sandboxes/browser/ticket?space_id=${FOREIGN_SPACE}&agent_id=a`,
      "POST"
    );
    expect(ticket.status).toBe(403);
    expect(readUserBrowserStatus).not.toHaveBeenCalled();
  });

  it("falls back to the caller's personal Space without space_id", async () => {
    const response = await request(build(), "/ai/sandboxes/browser");
    expect(response.status).toBe(200);
    expect(getSpaceSurface).toHaveBeenCalledWith(PERSONAL_SPACE);
    expect(readUserBrowserStatus).toHaveBeenCalledWith({
      spaceId: PERSONAL_SPACE,
      tenantId: TENANT,
    });
  });

  it("rejects a malformed space_id", async () => {
    const response = await request(
      build(),
      "/ai/sandboxes/browser?space_id=not-a-uuid"
    );
    expect(response.status).toBe(400);
  });

  it("mints a ticket for one agent's window in a member Space", async () => {
    const app = build();
    const missingAgent = await request(
      app,
      `/ai/sandboxes/browser/ticket?space_id=${SPACE}`,
      "POST"
    );
    expect(missingAgent.status).toBe(400);
    const response = await request(
      app,
      `/ai/sandboxes/browser/ticket?space_id=${SPACE}&agent_id=agent-a`,
      "POST"
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ws_url: string };
    const ticket = decodeURIComponent(body.ws_url.split("ticket=")[1] ?? "");
    expect(verifyBrowserTicket(ticket, "secret")).toMatchObject({
      agent_id: "agent-a",
      sandbox_id: `engenty-browser-${TENANT}-${SPACE}`,
      space_id: SPACE,
      tenant_id: TENANT,
    });
  });
});
