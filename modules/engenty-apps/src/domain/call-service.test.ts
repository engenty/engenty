import { describe, expect, it, vi } from "vitest";
import {
  makeFakeAppsRepo,
  makeFakeStore,
  makeManifest,
} from "../api/test-helpers.js";
import type { AppHostClient } from "../lib/app-host-client.js";
import { callApp, isPrivilegedAction } from "./call-service.js";
import { approveRelease, proposeRelease } from "./release-service.js";

const TENANT = "00000000-0000-4000-8000-000000000001";

function makeAppHost(overrides: Partial<AppHostClient> = {}): AppHostClient {
  return {
    deploy: vi.fn(async (appId: string) => ({
      appId,
      namespace: "ns",
      pool: "pool",
      regions: ["default"],
      release: "rel-abc",
    })),
    destroy: vi.fn(async () => undefined),
    request: vi.fn(async () => ({
      body: JSON.stringify({ ok: true }),
      headers: {},
      status: 200,
    })),
    ...overrides,
  };
}

async function seedLiveApp(manifestOverrides = {}) {
  const store = makeFakeStore();
  const repo = makeFakeAppsRepo(store);
  const app = await repo.createApp(
    { name: "Travel expenses", slug: "travel-expenses" },
    { createdBy: "engenty.app-coder", kind: "agent" }
  );
  const draft = await repo.getOrCreateDraftVersion(app.id, {
    createdBy: "engenty.app-coder",
    kind: "agent",
  });
  await repo.updateVersion(draft.id, {
    files: {
      "index.html": "<h1>hi</h1>",
      "server.js": "export default { fetch: () => Response.json({}) };",
    },
    manifest: makeManifest(manifestOverrides),
  });
  const appHost = makeAppHost();
  const deps = { appHost, repo, tenantId: TENANT };
  await proposeRelease(deps, { appId: app.id });
  await approveRelease(deps, { appId: app.id, version: 1 });
  return { app, appHost, repo, store };
}

describe("isPrivilegedAction", () => {
  it("treats high risk or explicit approval as privileged", () => {
    expect(isPrivilegedAction({ id: "a", risk: "high", summary: "" })).toBe(
      true
    );
    expect(
      isPrivilegedAction({
        id: "a",
        requiresApproval: true,
        risk: "low",
        summary: "",
      })
    ).toBe(true);
    expect(isPrivilegedAction({ id: "a", risk: "low", summary: "" })).toBe(
      false
    );
  });
});

describe("callApp", () => {
  it("invokes a declared low-risk action", async () => {
    const { app, appHost, repo } = await seedLiveApp();

    const result = await callApp(
      { appHost, repo, tenantId: TENANT },
      { action: "collect", appId: app.id, input: { amount: 35 } },
      { allowPrivileged: false }
    );

    expect(result.status).toBe(200);
    expect(result.output).toEqual({ ok: true });
    expect(appHost.request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST", path: "/collect" })
    );
  });

  it("refuses an action the manifest does not declare", async () => {
    const { app, appHost, repo } = await seedLiveApp();

    // The backend would happily serve /wipe — the manifest is what decides.
    await expect(
      callApp(
        { appHost, repo, tenantId: TENANT },
        { action: "wipe", appId: app.id },
        { allowPrivileged: false }
      )
    ).rejects.toThrow("app_action_not_declared");
    expect(appHost.request).not.toHaveBeenCalled();
  });

  it("refuses a privileged action on the unprivileged path", async () => {
    const { app, appHost, repo } = await seedLiveApp();

    await expect(
      callApp(
        { appHost, repo, tenantId: TENANT },
        { action: "finalize", appId: app.id },
        { allowPrivileged: false }
      )
    ).rejects.toThrow("app_action_requires_approval");
    expect(appHost.request).not.toHaveBeenCalled();
  });

  it("runs a privileged action on the privileged path", async () => {
    const { app, appHost, repo } = await seedLiveApp();

    const result = await callApp(
      { appHost, repo, tenantId: TENANT },
      { action: "finalize", appId: app.id },
      { allowPrivileged: true }
    );
    expect(result.action).toBe("finalize");
  });

  it("refuses a low-risk action on the privileged path", async () => {
    const { app, appHost, repo } = await seedLiveApp();

    // Otherwise a caller could make a human approve something the manifest
    // says needs no approval, which trains people to click through.
    await expect(
      callApp(
        { appHost, repo, tenantId: TENANT },
        { action: "collect", appId: app.id },
        { allowPrivileged: true }
      )
    ).rejects.toThrow("app_action_not_privileged");
  });

  it("forwards the capability handle to the guest, never a token", async () => {
    const { app, appHost, repo } = await seedLiveApp();

    await callApp(
      { appHost, repo, tenantId: TENANT },
      { action: "collect", appId: app.id, capability: "opaque-handle" },
      { allowPrivileged: false }
    );

    const [, req] = (appHost.request as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, { headers: Record<string, string> }];
    expect(req.headers["x-engenty-capability"]).toBe("opaque-handle");
    expect(Object.keys(req.headers)).not.toContain("authorization");
  });

  it("refuses to call an app that is not active", async () => {
    const store = makeFakeStore();
    const repo = makeFakeAppsRepo(store);
    const app = await repo.createApp(
      { name: "Draft", slug: "draft-app" },
      { createdBy: "engenty.app-coder", kind: "agent" }
    );

    await expect(
      callApp(
        { appHost: makeAppHost(), repo, tenantId: TENANT },
        { action: "collect", appId: app.id },
        { allowPrivileged: false }
      )
    ).rejects.toThrow("app_not_active");
  });

  it("passes a non-JSON body through instead of failing", async () => {
    const { app, repo } = await seedLiveApp();
    const appHost = makeAppHost({
      request: vi.fn(async () => ({
        body: "plain text",
        headers: {},
        status: 200,
      })),
    });

    const result = await callApp(
      { appHost, repo, tenantId: TENANT },
      { action: "collect", appId: app.id },
      { allowPrivileged: false }
    );
    expect(result.output).toBe("plain text");
  });
});
