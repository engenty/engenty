import { describe, expect, it, vi } from "vitest";
import {
  type FakeAppHost,
  makeFakeAppHost,
  makeFakeAppsRepo,
  makeFakeStore,
  makeManifest,
  seedSource,
} from "../api/test-helpers.js";
import { appHostId } from "../lib/app-host-client.js";
import type { AppManifest } from "../schema/types.js";
import {
  approveRelease,
  proposeRelease,
  rejectRelease,
  rollbackRelease,
} from "./release-service.js";

const TENANT = "00000000-0000-4000-8000-000000000001";
const ACTOR = { createdBy: "engenty.app-coder", kind: "agent" as const };
const KNOWN_OPERATIONS = new Set(["inbox_threads_list", "contacts_list"]);
const hasOperation = (id: string) => KNOWN_OPERATIONS.has(id);

const BACKEND = "export default { fetch: () => Response.json({}) };";

/** An App whose work tree holds a manifest and files, committed on the fake host. */
async function seedApp(
  files: Record<string, string> = {},
  manifestOverrides: Partial<AppManifest> = {},
  host: FakeAppHost = makeFakeAppHost()
) {
  const store = makeFakeStore();
  const repo = makeFakeAppsRepo(store);
  const app = await repo.createApp(
    { name: "Travel expenses", slug: "travel-expenses", spaceId: null },
    ACTOR
  );
  const hostId = appHostId(TENANT, app.id);
  const sha = await seedSource(host, hostId, makeManifest(manifestOverrides), {
    "index.html": "<h1>hi</h1>",
    "server.js": BACKEND,
    ...files,
  });
  const deps = { appHost: host, hasOperation, repo, tenantId: TENANT };
  return { app, deps, host, hostId, repo, sha, store };
}

/** Commit a change to the App's tree, the way an agent or app_file_write would. */
async function change(
  ctx: { host: FakeAppHost; hostId: string },
  files: Record<string, string>,
  manifest?: AppManifest
) {
  return ctx.host.writeSource(
    ctx.hostId,
    { slug: "travel-expenses", spaceId: null, tenantId: TENANT },
    {
      files: manifest
        ? { ...files, "engenty.json": JSON.stringify(manifest) }
        : files,
      message: "change",
    }
  );
}

describe("proposeRelease", () => {
  it("releases the committed tree without activating it", async () => {
    const { app, deps, sha, store } = await seedApp();

    const result = await proposeRelease(deps, { actor: ACTOR, appId: app.id });

    expect(deps.appHost.deploys).toHaveLength(1);
    expect(result.version.sha).toBe(sha);
    expect(result.version.release).toMatch(/^rel-/);
    expect(result.version.frontend_html).toBe("<h1>hi</h1>");
    // Still awaiting a human — building is not approving.
    expect(result.version.status).toBe("proposed");
    expect(store.apps[0].active_version_id).toBeNull();
    expect(store.apps[0].status).toBe("draft");
  });

  it("commits uncommitted work first, so the release is exactly the tree", async () => {
    const { app, deps, host, hostId } = await seedApp();
    // An agent edited through the space computer and did not commit: the
    // fake host models that as a pending tree change.
    host.repos.get(hostId)!.tree["index.html"] = "<h1>edited</h1>";

    const result = await proposeRelease(deps, {
      actor: ACTOR,
      appId: app.id,
      note: "ship the edit",
    });

    const committed = await host.readSource(hostId, result.version.sha);
    expect(committed.files["index.html"]).toBe("<h1>edited</h1>");
    expect(result.version.frontend_html).toBe("<h1>edited</h1>");
  });

  it("answers the existing version when the same commit is proposed twice", async () => {
    const { app, deps } = await seedApp();
    const first = await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    const second = await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    expect(second.version.id).toBe(first.version.id);
    expect(deps.appHost.deploys).toHaveLength(1);
  });

  it("records a failed version with the build log and moves on", async () => {
    const host = makeFakeAppHost({
      deploy: vi.fn(async () => {
        const error = new Error("build failed") as Error & { detail: unknown };
        error.name = "AppHostBuildError";
        error.detail = {
          buildLog: 'index.js:1:33: ERROR: Expected "}"',
          code: "agentos_apps_build_failed",
          message: "build failed",
        };
        throw error;
      }),
    });
    const {
      app,
      deps,
      host: seeded,
      hostId,
      store,
    } = await seedApp({}, {}, host);

    await expect(
      proposeRelease(deps, { actor: ACTOR, appId: app.id })
    ).rejects.toThrow("app_build_failed");

    // The agent's feedback loop reads the log off the failed version.
    expect(store.versions).toHaveLength(1);
    expect(store.versions[0].status).toBe("failed");
    expect(store.versions[0].build_log).toContain('Expected "}"');
    expect(store.versions[0].release).toBeNull();

    // A fix is a new commit and a new version; the failed one stays as history.
    await change({ host: seeded, hostId }, { "server.js": BACKEND });
    host.deploy = makeFakeAppHost().deploy;
    const fixed = await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    expect(fixed.version.version).toBe(2);
    expect(fixed.version.status).toBe("proposed");
  });

  it("refuses a manifest whose frontend entry is not among the files", async () => {
    const { app, deps, store } = await seedApp(
      {},
      { entry: { frontend: "missing.html" } }
    );

    await expect(
      proposeRelease(deps, { actor: ACTOR, appId: app.id })
    ).rejects.toThrow("app_entry_missing");
    expect(store.versions[0].status).toBe("failed");
    expect(store.versions[0].build_log).toContain("missing.html");
    expect(deps.appHost.deploys).toHaveLength(0);
  });

  it("refuses an invalid manifest before reaching the build VM", async () => {
    const { app, deps, host, hostId, store } = await seedApp();
    await host.writeSource(
      hostId,
      { slug: "x", spaceId: null, tenantId: TENANT },
      { files: { "engenty.json": '{"name":""}' }, message: "break it" }
    );

    await expect(
      proposeRelease(deps, { actor: ACTOR, appId: app.id })
    ).rejects.toThrow("app_manifest_invalid");
    expect(store.versions[0].status).toBe("failed");
    expect(store.versions[0].build_log).toContain("manifest is invalid");
    expect(deps.appHost.deploys).toHaveLength(0);
  });

  it("refuses a tree without a manifest", async () => {
    const { app, deps, host, hostId, store } = await seedApp();
    await host.writeSource(
      hostId,
      { slug: "x", spaceId: null, tenantId: TENANT },
      { delete: ["engenty.json"], message: "drop manifest" }
    );

    await expect(
      proposeRelease(deps, { actor: ACTOR, appId: app.id })
    ).rejects.toThrow("app_manifest_invalid");
    expect(store.versions[0].build_log).toContain("engenty.json");
  });

  it("refuses a manifest declaring an operation that does not exist", async () => {
    const { app, deps, store } = await seedApp(
      {},
      {
        engenty: {
          operations: ["inbox_threads_list", "gmail_send_mesage"],
          tables: [],
        },
      }
    );

    await expect(
      proposeRelease(deps, { actor: ACTOR, appId: app.id })
    ).rejects.toThrow("app_manifest_invalid");
    expect(store.versions[0].status).toBe("failed");
    expect(store.versions[0].build_log).toContain("gmail_send_mesage");
    expect(store.versions[0].build_log).not.toContain("inbox_threads_list");
    expect(deps.appHost.deploys).toHaveLength(0);
  });

  it("fails loudly when no app host is configured", async () => {
    const { app, deps } = await seedApp();
    await expect(
      proposeRelease(
        { ...deps, appHost: null },
        { actor: ACTOR, appId: app.id }
      )
    ).rejects.toThrow("app_host_unavailable");
  });
});

describe("approveRelease", () => {
  it("activates a built proposal and makes the app live", async () => {
    const { app, deps, store } = await seedApp();
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });

    const result = await approveRelease(deps, { appId: app.id, version: 1 });

    expect(result.version.status).toBe("active");
    expect(result.version.deployed_at).not.toBeNull();
    expect(store.apps[0].status).toBe("active");
    expect(store.apps[0].active_version_id).toBe(result.version.id);
  });

  it("refuses to activate a version that never built", async () => {
    const { app, deps, store } = await seedApp(
      {},
      { entry: { frontend: "missing.html" } }
    );
    await proposeRelease(deps, { actor: ACTOR, appId: app.id }).catch(
      () => undefined
    );
    expect(store.versions[0].status).toBe("failed");
    await expect(
      approveRelease(deps, { appId: app.id, version: 1 })
    ).rejects.toThrow("app_version_not_proposed");
  });

  it("leaves exactly one active version after a second release", async () => {
    const { app, deps, host, hostId, store } = await seedApp();
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });

    await change({ host, hostId }, { "index.html": "<h1>v2</h1>" });
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 2 });

    const active = store.versions.filter((v) => v.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(2);
    expect(store.apps[0].active_version_id).toBe(active[0].id);
  });
});

describe("rejectRelease", () => {
  it("archives the proposal and leaves the active version serving", async () => {
    const { app, deps, host, hostId, store } = await seedApp();
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });
    const activeId = store.apps[0].active_version_id;

    await change({ host, hostId }, { "index.html": "<h1>v2</h1>" });
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });

    await rejectRelease(deps, {
      appId: app.id,
      reason: "leaks receipts",
      version: 2,
    });

    // A rejected proposal must never take a live app offline.
    expect(store.apps[0].active_version_id).toBe(activeId);
    expect(store.apps[0].status).toBe("active");
    const rejected = store.versions.find((v) => v.version === 2);
    expect(rejected?.status).toBe("archived");
    expect(rejected?.build_log).toContain("leaks receipts");
  });

  it("refuses to reject a version that is not proposed", async () => {
    const { app, deps } = await seedApp();
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });

    await expect(
      rejectRelease(deps, { appId: app.id, version: 1 })
    ).rejects.toThrow("app_version_not_proposed");
  });
});

describe("the deploy payload's backend entrypoint", () => {
  it("injects a package.json naming the backend, or agentOS serves it as a static site", async () => {
    const { app, deps } = await seedApp();
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });

    const manifest = JSON.parse(deps.appHost.deploys[0]["package.json"]) as {
      main: string;
      type: string;
    };
    expect(manifest.main).toBe("server.js");
    // The documented backend shape is `export default { fetch }` — ESM.
    expect(manifest.type).toBe("module");
  });

  it("ships no package.json for a frontend-only app", async () => {
    const { app, deps } = await seedApp(
      {},
      { entry: { frontend: "index.html" } }
    );
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    expect(deps.appHost.deploys[0]["package.json"]).toBeUndefined();
  });

  it("leaves an app-authored package.json untouched", async () => {
    const authored = JSON.stringify({ main: "custom.js", type: "module" });
    const { app, deps } = await seedApp({
      "custom.js": "export default { fetch: () => new Response('') };",
      "package.json": authored,
    });
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    expect(deps.appHost.deploys[0]["package.json"]).toBe(authored);
  });

  it("rejects a declared backend that was never written", async () => {
    const { app, deps, host, hostId, store } = await seedApp();
    await host.writeSource(
      hostId,
      { slug: "x", spaceId: null, tenantId: TENANT },
      { delete: ["server.js"], message: "drop backend" }
    );

    await expect(
      proposeRelease(deps, { actor: ACTOR, appId: app.id })
    ).rejects.toThrow("app_entry_missing");
    expect(store.versions[0].build_log).toContain('entry.backend "server.js"');
    expect(deps.appHost.deploys).toHaveLength(0);
  });

  it("re-injects the backend entrypoint on rollback", async () => {
    const { app, deps } = await seedApp();
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });

    await rollbackRelease(deps, { appId: app.id, version: 1 });

    const redeployed = deps.appHost.deploys.at(-1) as Record<string, string>;
    expect(JSON.parse(redeployed["package.json"]).main).toBe("server.js");
  });
});

describe("proposeRelease with a bundled frontend", () => {
  const SOURCES = {
    "src/App.tsx": `
      export function App() {
        return <p className="hello">from a component</p>;
      }
    `,
    "src/main.tsx": `
      import { createRoot } from "react-dom/client";
      import { App } from "./App";
      createRoot(document.getElementById("root")!).render(<App />);
    `,
  };
  const BUNDLED = { entry: { frontend: "src/main.tsx" } };

  it("bundles the sources and stores the built document", async () => {
    const { app, deps, host, hostId } = await seedApp(SOURCES, BUNDLED);

    const result = await proposeRelease(deps, { actor: ACTOR, appId: app.id });

    expect(result.version.frontend_html).toContain("<!doctype html>");
    expect(result.version.frontend_html).toContain("from a component");
    expect(result.version.build_log).toBeNull();
    expect(result.version.release).toMatch(/^rel-/);
    // The commit is untouched — the build output never enters the repository.
    const tree = await host.readSource(hostId, result.version.sha);
    expect(Object.keys(tree.files).sort()).toEqual([
      "engenty.json",
      "index.html",
      "server.js",
      "src/App.tsx",
      "src/main.tsx",
    ]);
  });

  it("gives agentOS an index.html so a source-only App can deploy", async () => {
    const { app, deps } = await seedApp(SOURCES, BUNDLED);
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    const deployed = deps.appHost.deploys[0];
    expect(deployed["index.html"]).toContain("from a component");
    expect(deployed["src/main.tsx"]).toBeDefined();
  });

  it("records the build log and never reaches the app host on a bad component", async () => {
    const { app, deps, store } = await seedApp(
      { ...SOURCES, "src/main.tsx": "export const broken = {" },
      BUNDLED
    );

    await expect(
      proposeRelease(deps, { actor: ACTOR, appId: app.id })
    ).rejects.toThrow("app_build_failed");

    expect(store.versions[0].status).toBe("failed");
    expect(store.versions[0].build_log).toContain("src/main.tsx");
    expect(store.versions[0].frontend_html).toBeNull();
    // A frontend that cannot compile must not cost a 30s build VM to discover.
    expect(deps.appHost.deploys).toHaveLength(0);
  });

  it("rolls back to the stored document without rebuilding", async () => {
    const { app, deps, host, hostId, store } = await seedApp(SOURCES, BUNDLED);
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });

    await change(
      { host, hostId },
      { "src/App.tsx": "export function App(){return null}" }
    );
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 2 });

    await rollbackRelease(deps, { appId: app.id, version: 1 });

    const redeployed = deps.appHost.deploys.at(-1) as Record<string, string>;
    expect(redeployed["index.html"]).toContain("from a component");
    expect(store.versions[0].status).toBe("active");
  });
});

describe("rollbackRelease", () => {
  it("redeploys a previous version from its commit", async () => {
    const { app, deps, host, hostId, store } = await seedApp();
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });

    await change(
      { host, hostId },
      { "index.html": "<h1>v2</h1>", "server.js": "export default { v: 2 }" }
    );
    await proposeRelease(deps, { actor: ACTOR, appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 2 });

    await rollbackRelease(deps, { appId: app.id, version: 1 });

    const active = store.versions.filter((v) => v.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(1);
    // The backend comes back from version 1's commit, not from the work tree.
    expect(deps.appHost.deploys).toHaveLength(3);
    expect(deps.appHost.deploys[2]["server.js"]).toBe(BACKEND);
  });

  it("refuses to roll back to a version that never built", async () => {
    const { app, deps } = await seedApp(
      {},
      { entry: { frontend: "nope.html" } }
    );
    await proposeRelease(deps, { actor: ACTOR, appId: app.id }).catch(
      () => undefined
    );
    await expect(
      rollbackRelease(deps, { appId: app.id, version: 1 })
    ).rejects.toThrow("app_version_not_built");
  });
});
