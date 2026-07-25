import { describe, expect, it } from "vitest";
import { APP_BY_ID_PATH, registerAppsApi } from "./index.js";
import {
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
      "app_actions_list",
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
    ]);
  });

  describe("the frontend route", () => {
    async function serveFrontend(version: {
      files: Record<string, string>;
      frontend_html?: string | null;
      frontendEntry: string;
    }) {
      const store = makeFakeStore();
      const repo = makeFakeAppsRepo(store);
      const { api, httpRoutes } = makeMockApi();
      registerAppsApi(api, repo);

      const app = await repo.createApp(
        { name: "Expenses", slug: "expenses" },
        { createdBy: "engenty.app-coder", kind: "agent" }
      );
      const draft = await repo.getOrCreateDraftVersion(app.id, {
        createdBy: "engenty.app-coder",
        kind: "agent",
      });
      await repo.updateVersion(draft.id, {
        files: version.files,
        frontend_html: version.frontend_html ?? null,
        manifest: makeManifest({
          entry: { frontend: version.frontendEntry },
        }),
        status: "active",
      });
      await repo.updateApp(app.id, { active_version_id: draft.id });

      const route = httpRoutes.find(
        (candidate) =>
          candidate.method === "get" && candidate.path.endsWith("/frontend")
      );
      return (await route?.handler({
        params: { id: app.id },
        request: new Request("https://engenty.test/api/apps/x/frontend"),
      } as never)) as { html?: string } | Response;
    }

    it("serves the built document when the entry names sources", async () => {
      const result = await serveFrontend({
        files: { "src/main.tsx": "// sources, not a document" },
        frontend_html: "<!doctype html><p>built</p>",
        frontendEntry: "src/main.tsx",
      });

      expect((result as { html: string }).html).toBe(
        "<!doctype html><p>built</p>"
      );
    });

    it("still serves files[entry] for a single-document app", async () => {
      const result = await serveFrontend({
        files: { "index.html": "<h1>hand written</h1>" },
        frontendEntry: "index.html",
      });

      expect((result as { html: string }).html).toBe("<h1>hand written</h1>");
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
    await repo.setConfig({ appId: "app-1", key: "theme", userId: null, value: "light" });

    expect(
      (await repo.resolveConfig({ appId: "app-1", key: "theme", userId: USER }))
        ?.value
    ).toBe("light");

    await repo.setConfig({ appId: "app-1", key: "theme", userId: USER, value: "dark" });

    expect(
      (await repo.resolveConfig({ appId: "app-1", key: "theme", userId: USER }))
        ?.value
    ).toBe("dark");
    // The default is untouched — a user setting their own value must not
    // rewrite what everyone else sees.
    expect(
      (await repo.resolveConfig({ appId: "app-1", key: "theme", userId: OTHER }))
        ?.value
    ).toBe("light");
  });

  it("keeps one user's value invisible to another", async () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    await repo.setConfig({ appId: "app-1", key: "filter", userId: USER, value: "mine" });

    expect(
      await repo.resolveConfig({ appId: "app-1", key: "filter", userId: OTHER })
    ).toBeNull();
    expect(
      await repo.listConfig({ appId: "app-1", userId: OTHER })
    ).toEqual([]);
  });

  it("shadows per key in a listing, not per store", async () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    await repo.setConfig({ appId: "app-1", key: "a", userId: null, value: "default-a" });
    await repo.setConfig({ appId: "app-1", key: "b", userId: null, value: "default-b" });
    await repo.setConfig({ appId: "app-1", key: "b", userId: USER, value: "user-b" });

    const entries = await repo.listConfig({ appId: "app-1", userId: USER });
    expect(entries.map((e) => [e.key, e.value])).toEqual([
      ["a", "default-a"],
      ["b", "user-b"],
    ]);
  });

  it("deletes only the level it was asked for", async () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    await repo.setConfig({ appId: "app-1", key: "k", userId: null, value: "default" });
    await repo.setConfig({ appId: "app-1", key: "k", userId: USER, value: "user" });

    await repo.deleteConfig({ appId: "app-1", key: "k", userId: USER });

    // Removing an override falls back to the default rather than to nothing.
    expect(
      (await repo.resolveConfig({ appId: "app-1", key: "k", userId: USER }))?.value
    ).toBe("default");
  });

  it("has no session axis — config outlives an artifact instance", async () => {
    const repo = makeFakeAppsRepo(makeFakeStore());
    await repo.setConfig({ appId: "app-1", key: "k", userId: USER, value: 1 });
    // There is no session_id to pass; the same read succeeds from any
    // instance, which is the whole reason this table exists next to app_data.
    expect(
      (await repo.resolveConfig({ appId: "app-1", key: "k", userId: USER }))?.value
    ).toBe(1);
  });
});
