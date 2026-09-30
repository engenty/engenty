import { describe, expect, it, vi } from "vitest";
import type { AppHostClient } from "../lib/app-host-client.js";
import { APP_BY_ID_PATH, registerAppsApi } from "./index.js";
import {
  defaultAuth,
  makeFakeAppHost,
  makeFakeAppsRepo,
  makeFakeStore,
  makeManifest,
  makeMockApi,
} from "./test-helpers.js";

describe("registerAppsApi", () => {
  it("registers expected HTTP routes", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, httpRoutes } = makeMockApi();
    registerAppsApi(api, repo);

    const signatures = httpRoutes
      .map((route) => `${route.method.toUpperCase()} ${route.path}`)
      .sort();

    expect(signatures).toContain(`GET ${APP_BY_ID_PATH}/frontend`);
    expect(signatures).toContain(`GET ${APP_BY_ID_PATH}/versions`);
  });

  it("registers the exact app operation set", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const ids = serverOperations.map((op) => op.operationId).sort();
    expect(ids).toEqual([
      "app_archive",
      "app_call",
      "app_call_privileged",
      "app_config_delete",
      "app_config_get",
      "app_config_list",
      "app_config_set",
      "app_create",
      "app_data_delete",
      "app_data_export",
      "app_data_get",
      "app_data_list",
      "app_data_set",
      "app_file_write",
      "app_get",
      "app_list",
      "app_release_approve",
      "app_release_propose",
      "app_release_reject",
      "app_release_rollback",
      "app_versions_list",
      "app_workflows_list",
    ]);
    expect(
      serverOperations.find((op) => op.operationId === "app_list")?.spacePolicy
    ).toEqual({ kind: "tenant_shared" });
  });

  describe("the frontend route", () => {
    async function serveFrontend(version: {
      frontend_html: string | null;
      requested?: number;
    }) {
      const store = makeFakeStore();
      const repo = makeFakeAppsRepo(store);
      const { api, httpRoutes } = makeMockApi();
      registerAppsApi(api, repo);

      const app = await repo.createApp(
        { name: "Expenses", slug: "expenses", spaceId: null },
        { createdBy: "engenty.app-coder", kind: "agent" }
      );
      const released = await repo.createVersion(
        { appId: app.id, manifest: makeManifest(), sha: "a".repeat(40) },
        { createdBy: "engenty.app-coder", kind: "agent" }
      );
      await repo.updateVersion(released.id, {
        frontend_html: version.frontend_html,
        release: "rel-1",
        status: "active",
      });
      await repo.updateApp(app.id, { active_version_id: released.id });

      const route = httpRoutes.find(
        (candidate) =>
          candidate.method === "get" && candidate.path.endsWith("/frontend")
      );
      const query =
        version.requested === undefined ? "" : `?version=${version.requested}`;
      return (await route?.handler({
        params: { id: app.id },
        request: new Request(
          `https://engenty.test/api/apps/x/frontend${query}`
        ),
      } as never)) as { html?: string; version?: number } | Response;
    }

    it("serves the document stored at release", async () => {
      const result = await serveFrontend({
        frontend_html: "<!doctype html><p>built</p>",
      });
      expect((result as { html: string }).html).toBe(
        "<!doctype html><p>built</p>"
      );
    });

    it("answers 404 for a version that stored no document", async () => {
      const result = (await serveFrontend({ frontend_html: null })) as Response;
      expect(result.status).toBe(404);
      await expect(result.json()).resolves.toEqual({
        error: "app_entry_missing",
      });
    });

    it("serves a pinned version by number", async () => {
      const result = await serveFrontend({
        frontend_html: "<p>v1</p>",
        requested: 1,
      });
      expect((result as { version: number }).version).toBe(1);
    });
  });

  it("gates activation on apps.approve, not on the module write capability", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    for (const id of [
      "app_release_approve",
      "app_release_reject",
      "app_release_rollback",
      "app_archive",
    ]) {
      expect(byId.get(id)?.requiredCapabilities).toEqual(["apps.approve"]);
      // The approval act must never itself require approval, or it deadlocks.
      expect(byId.get(id)?.requiresApproval).toBe(false);
    }
  });

  it("keeps app_call unprivileged and app_call_privileged approval-gated", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    expect(byId.get("app_call")?.requiresApproval).toBe(false);
    expect(byId.get("app_call")?.riskLevel).toBe("low");
    expect(byId.get("app_call_privileged")?.requiresApproval).toBe(true);
    expect(byId.get("app_call_privileged")?.riskLevel).toBe("high");
  });

  // Regression: callApp returns domain-cased { appId }, but the operation
  // contract speaks wire snake_case { app_id }. When the handler forgot to
  // translate, core's outputSchema.parse blew up with "app_id … received
  // undefined" — surfaced to callers as a 400 "validation_error" that looked
  // exactly like broken INPUT validation on /api/tools/app_call_privileged/invoke.
  it("app_call twins return output matching their declared output schema", async () => {
    const store = makeFakeStore();
    const repo = makeFakeAppsRepo(store);
    const appHost: AppHostClient = makeFakeAppHost({
      request: vi.fn(async () => ({
        body: JSON.stringify({ ok: true }),
        headers: {},
        status: 200,
      })),
    });
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo, { appHost });

    const app = await repo.createApp(
      { name: "Twins", slug: "twins", spaceId: null },
      { createdBy: "engenty.app-coder", kind: "agent" }
    );
    // The wire contract requires uuid app ids; the fake store mints "app-1".
    app.id = "00000000-0000-4000-8000-0000000000aa";
    const released = await repo.createVersion(
      { appId: app.id, manifest: makeManifest(), sha: "a".repeat(40) },
      { createdBy: "engenty.app-coder", kind: "agent" }
    );
    await repo.updateVersion(released.id, {
      frontend_html: "<h1>hi</h1>",
      release: "rel-abc",
      status: "active",
    });
    await repo.updateApp(app.id, {
      active_version_id: released.id,
      status: "active",
    });

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    const ctx = { auth: defaultAuth, recordAuditEvent: () => {} };
    const cases = [
      { action: "collect", operationId: "app_call" },
      { action: "finalize", operationId: "app_call_privileged" },
    ] as const;
    for (const { action, operationId } of cases) {
      const op = byId.get(operationId);
      const result = await op?.handler(
        { action, app_id: app.id, session_id: "x" },
        ctx as never
      );
      // The exact parse core's route layer applies to the handler result.
      expect(() => op?.outputSchema?.parse(result)).not.toThrow();
      expect(result).toMatchObject({
        action,
        app_id: app.id,
        output: { ok: true },
        status: 200,
      });
    }
  });

  it("keeps authoring operations approval-gated", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    for (const id of ["app_create", "app_file_write", "app_release_propose"]) {
      expect(byId.get(id)?.requiresApproval).toBe(true);
      expect(byId.get(id)?.requiredCapabilities).toEqual([
        "module.engenty-apps.write",
      ]);
    }
  });

  it("app_file_write commits into the App's repository and writes the manifest as a file", async () => {
    const store = makeFakeStore();
    const repo = makeFakeAppsRepo(store);
    const appHost = makeFakeAppHost();
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo, { appHost });
    const app = await repo.createApp(
      { name: "Notes", slug: "notes", spaceId: null },
      { createdBy: "engenty.app-coder", kind: "agent" }
    );
    app.id = "00000000-0000-4000-8000-0000000000ab";

    const op = serverOperations.find((o) => o.operationId === "app_file_write");
    const result = (await op?.handler(
      {
        app_id: app.id,
        files: { "index.html": "<h1>notes</h1>" },
        manifest: makeManifest({ entry: { frontend: "index.html" } }),
        message: "first draft",
      },
      { auth: defaultAuth, recordAuditEvent: () => {} } as never
    )) as { app_id: string; changed: boolean; sha: string };

    expect(result.changed).toBe(true);
    expect(() => op?.outputSchema?.parse(result)).not.toThrow();
    const hostId = [...appHost.repos.keys()][0];
    const tree = await appHost.readSource(hostId, result.sha);
    expect(Object.keys(tree.files).sort()).toEqual([
      "engenty.json",
      "index.html",
    ]);
    expect(JSON.parse(tree.files["engenty.json"]).entry.frontend).toBe(
      "index.html"
    );
    // The repository is the App's state now: nothing is written to Postgres.
    expect(store.versions).toHaveLength(0);
  });

  it("app_create records the space the call happens in", async () => {
    const store = makeFakeStore();
    const repo = makeFakeAppsRepo(store);
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);
    const op = serverOperations.find((o) => o.operationId === "app_create");
    const space = "00000000-0000-4000-8000-0000000000cc";
    await op?.handler({ name: "In a space", slug: "in-a-space" }, {
      auth: { ...defaultAuth, spaceId: space },
    } as never);
    await op?.handler({ name: "Outside", slug: "outside" }, {
      auth: defaultAuth,
    } as never);
    expect(store.apps.map((app) => app.space_id)).toEqual([space, null]);
  });

  it("leaves the app's own working store un-gated", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    for (const id of [
      "app_data_get",
      "app_data_list",
      "app_data_set",
      "app_data_delete",
    ]) {
      expect(byId.get(id)?.requiresApproval).toBe(false);
      expect(byId.get(id)?.riskLevel).toBe("low");
    }
    expect(byId.get("app_data_set")?.requiredCapabilities).toEqual([
      "module.engenty-apps.write",
    ]);
    expect(byId.get("app_data_get")?.requiredCapabilities).toEqual([
      "module.engenty-apps.read",
    ]);
  });

  it("leaves app config un-gated but write-capability guarded", () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    const { api, serverOperations } = makeMockApi();
    registerAppsApi(api, repo);

    const byId = new Map(serverOperations.map((op) => [op.operationId, op]));
    for (const id of [
      "app_config_get",
      "app_config_list",
      "app_config_set",
      "app_config_delete",
    ]) {
      expect(byId.get(id)?.requiresApproval).toBe(false);
      expect(byId.get(id)?.riskLevel).toBe("low");
    }
    expect(byId.get("app_config_set")?.requiredCapabilities).toEqual([
      "module.engenty-apps.write",
    ]);
    expect(byId.get("app_config_get")?.requiredCapabilities).toEqual([
      "module.engenty-apps.read",
    ]);
  });
});

describe("app config levels", () => {
  const USER = "00000000-0000-4000-8000-0000000000aa";
  const OTHER = "00000000-0000-4000-8000-0000000000bb";

  it("resolves a user's own value over the tenant default", async () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    await repo.setConfig({
      appId: "app-1",
      key: "theme",
      userId: null,
      value: "light",
    });

    expect(
      (await repo.resolveConfig({ appId: "app-1", key: "theme", userId: USER }))
        ?.value
    ).toBe("light");

    await repo.setConfig({
      appId: "app-1",
      key: "theme",
      userId: USER,
      value: "dark",
    });

    expect(
      (await repo.resolveConfig({ appId: "app-1", key: "theme", userId: USER }))
        ?.value
    ).toBe("dark");
    // The default is untouched — a user setting their own value must not
    // rewrite what everyone else sees.
    expect(
      (
        await repo.resolveConfig({
          appId: "app-1",
          key: "theme",
          userId: OTHER,
        })
      )?.value
    ).toBe("light");
  });

  it("keeps one user's value invisible to another", async () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    await repo.setConfig({
      appId: "app-1",
      key: "filter",
      userId: USER,
      value: "mine",
    });

    expect(
      await repo.resolveConfig({ appId: "app-1", key: "filter", userId: OTHER })
    ).toBeNull();
    expect(await repo.listConfig({ appId: "app-1", userId: OTHER })).toEqual(
      []
    );
  });

  it("shadows per key in a listing, not per store", async () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    await repo.setConfig({
      appId: "app-1",
      key: "a",
      userId: null,
      value: "default-a",
    });
    await repo.setConfig({
      appId: "app-1",
      key: "b",
      userId: null,
      value: "default-b",
    });
    await repo.setConfig({
      appId: "app-1",
      key: "b",
      userId: USER,
      value: "user-b",
    });

    const entries = await repo.listConfig({ appId: "app-1", userId: USER });
    expect(entries.map((e) => [e.key, e.value])).toEqual([
      ["a", "default-a"],
      ["b", "user-b"],
    ]);
  });

  it("deletes only the level it was asked for", async () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    await repo.setConfig({
      appId: "app-1",
      key: "k",
      userId: null,
      value: "default",
    });
    await repo.setConfig({
      appId: "app-1",
      key: "k",
      userId: USER,
      value: "user",
    });

    await repo.deleteConfig({ appId: "app-1", key: "k", userId: USER });

    // Removing an override falls back to the default rather than to nothing.
    expect(
      (await repo.resolveConfig({ appId: "app-1", key: "k", userId: USER }))
        ?.value
    ).toBe("default");
  });

  it("has no session axis — config outlives an artifact instance", async () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    await repo.setConfig({ appId: "app-1", key: "k", userId: USER, value: 1 });
    // There is no session_id to pass; the same read succeeds from any
    // instance, which is the whole reason this table exists next to app_data.
    expect(
      (await repo.resolveConfig({ appId: "app-1", key: "k", userId: USER }))
        ?.value
    ).toBe(1);
  });
});
