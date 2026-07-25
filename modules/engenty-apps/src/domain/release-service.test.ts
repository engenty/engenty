import { describe, expect, it, vi } from "vitest";
import {
  makeFakeAppsRepo,
  makeFakeStore,
  makeManifest,
} from "../api/test-helpers.js";
import type { AppHostClient } from "../lib/app-host-client.js";
import {
  approveRelease,
  proposeRelease,
  rejectRelease,
  rollbackRelease,
} from "./release-service.js";

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
    request: vi.fn(async () => ({ body: "{}", headers: {}, status: 200 })),
    ...overrides,
  };
}

async function seedDraft(
  files: Record<string, string> = {},
  manifestOverrides: Partial<Parameters<typeof makeManifest>[0]> = {}
) {
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
    files: { "index.html": "<h1>hi</h1>", ...files },
    manifest: makeManifest(manifestOverrides),
  });
  return { app, repo, store };
}

/** A draft whose entry names sources, so propose has to bundle it. */
async function seedBundledDraft(files: Record<string, string>) {
  const { app, repo, store } = await seedDraft(files, {
    entry: { backend: "server.js", frontend: "src/main.tsx" },
  });
  // Bundle-mode Apps carry no hand-written document.
  const draft = store.versions[0];
  const { "index.html": _dropped, ...sources } = draft.files;
  await repo.updateVersion(draft.id, { files: sources });
  return { app, repo, store };
}

describe("proposeRelease", () => {
  it("builds the draft and records the release without activating it", async () => {
    const { app, repo, store } = await seedDraft();
    const appHost = makeAppHost();

    const result = await proposeRelease(
      { appHost, repo, tenantId: TENANT },
      { appId: app.id }
    );

    expect(appHost.deploy).toHaveBeenCalledOnce();
    expect(result.version.release).toBe("rel-abc");
    // Still awaiting a human — building is not approving.
    expect(result.version.status).toBe("proposed");
    expect(store.apps[0].active_version_id).toBeNull();
    expect(store.apps[0].status).toBe("draft");
  });

  it("stores the build log and does not bump the version on failure", async () => {
    const { app, repo, store } = await seedDraft();
    const appHost = makeAppHost({
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

    await expect(
      proposeRelease({ appHost, repo, tenantId: TENANT }, { appId: app.id })
    ).rejects.toThrow("app_build_failed");

    // The agent's feedback loop: same draft, log attached, version unchanged.
    expect(store.versions).toHaveLength(1);
    expect(store.versions[0].version).toBe(1);
    expect(store.versions[0].status).toBe("proposed");
    expect(store.versions[0].build_log).toContain('Expected "}"');
    expect(store.versions[0].release).toBeNull();
  });

  it("refuses a manifest whose frontend entry is not among the files", async () => {
    const { app, repo, store } = await seedDraft();
    await repo.updateVersion(store.versions[0].id, {
      files: { "server.js": "export default {}" },
    });

    await expect(
      proposeRelease(
        { appHost: makeAppHost(), repo, tenantId: TENANT },
        { appId: app.id }
      )
    ).rejects.toThrow("app_entry_missing");
  });

  it("refuses an invalid manifest before reaching the build VM", async () => {
    const { app, repo, store } = await seedDraft();
    await repo.updateVersion(store.versions[0].id, {
      manifest: { name: "" } as never,
    });
    const appHost = makeAppHost();

    await expect(
      proposeRelease({ appHost, repo, tenantId: TENANT }, { appId: app.id })
    ).rejects.toThrow("app_manifest_invalid");
    expect(appHost.deploy).not.toHaveBeenCalled();
  });

  it("fails loudly when no app host is configured", async () => {
    const { app, repo } = await seedDraft();
    await expect(
      proposeRelease({ appHost: null, repo, tenantId: TENANT }, { appId: app.id })
    ).rejects.toThrow("app_host_unavailable");
  });
});

describe("approveRelease", () => {
  it("activates a built proposal and makes the app live", async () => {
    const { app, repo, store } = await seedDraft();
    await proposeRelease(
      { appHost: makeAppHost(), repo, tenantId: TENANT },
      { appId: app.id }
    );

    const result = await approveRelease(
      { appHost: null, repo, tenantId: TENANT },
      { appId: app.id, version: 1 }
    );

    expect(result.version.status).toBe("active");
    expect(result.version.deployed_at).not.toBeNull();
    expect(store.apps[0].status).toBe("active");
    expect(store.apps[0].active_version_id).toBe(result.version.id);
  });

  it("refuses to activate a version that never built", async () => {
    const { app, repo } = await seedDraft();
    await expect(
      approveRelease(
        { appHost: null, repo, tenantId: TENANT },
        { appId: app.id, version: 1 }
      )
    ).rejects.toThrow("app_version_not_built");
  });

  it("leaves exactly one active version after a second release", async () => {
    const { app, repo, store } = await seedDraft();
    const deps = { appHost: makeAppHost(), repo, tenantId: TENANT };
    await proposeRelease(deps, { appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });

    const second = await repo.getOrCreateDraftVersion(app.id, {
      createdBy: "engenty.app-coder",
      kind: "agent",
    });
    await repo.updateVersion(second.id, {
      files: { "index.html": "<h1>v2</h1>" },
      manifest: makeManifest(),
    });
    await proposeRelease(deps, { appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 2 });

    const active = store.versions.filter((v) => v.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(2);
    expect(store.apps[0].active_version_id).toBe(active[0].id);
  });
});

describe("rejectRelease", () => {
  it("archives the proposal and leaves the active version serving", async () => {
    const { app, repo, store } = await seedDraft();
    const deps = { appHost: makeAppHost(), repo, tenantId: TENANT };
    await proposeRelease(deps, { appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });
    const activeId = store.apps[0].active_version_id;

    const second = await repo.getOrCreateDraftVersion(app.id, {
      createdBy: "engenty.app-coder",
      kind: "agent",
    });
    await repo.updateVersion(second.id, {
      files: { "index.html": "<h1>v2</h1>" },
      manifest: makeManifest(),
    });
    await proposeRelease(deps, { appId: app.id });

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
    const { app, repo } = await seedDraft();
    const deps = { appHost: makeAppHost(), repo, tenantId: TENANT };
    await proposeRelease(deps, { appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });

    await expect(
      rejectRelease(deps, { appId: app.id, version: 1 })
    ).rejects.toThrow("app_version_not_proposed");
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

  it("bundles the sources and stores the built document", async () => {
    const { app, repo, store } = await seedBundledDraft(SOURCES);
    const appHost = makeAppHost();

    const result = await proposeRelease(
      { appHost, repo, tenantId: TENANT },
      { appId: app.id }
    );

    expect(result.version.frontend_html).toContain("<!doctype html>");
    expect(result.version.frontend_html).toContain("from a component");
    expect(result.version.build_log).toBeNull();
    expect(result.version.release).toBe("rel-abc");
    // Sources are untouched — the build output never pollutes what the agent
    // is editing.
    expect(Object.keys(store.versions[0].files).sort()).toEqual([
      "src/App.tsx",
      "src/main.tsx",
    ]);
  });

  it("gives agentOS an index.html so a source-only App can deploy", async () => {
    const { app, repo } = await seedBundledDraft(SOURCES);
    const appHost = makeAppHost();

    await proposeRelease({ appHost, repo, tenantId: TENANT }, { appId: app.id });

    const deployed = (appHost.deploy as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as Record<string, string>;
    expect(deployed["index.html"]).toContain("from a component");
    expect(deployed["src/main.tsx"]).toBeDefined();
  });

  it("records the build log and never reaches the app host on a bad component", async () => {
    const { app, repo, store } = await seedBundledDraft({
      "src/main.tsx": "export const broken = {",
    });
    const appHost = makeAppHost();

    await expect(
      proposeRelease({ appHost, repo, tenantId: TENANT }, { appId: app.id })
    ).rejects.toThrow("app_build_failed");

    expect(store.versions[0].build_log).toContain("src/main.tsx");
    expect(store.versions[0].frontend_html).toBeNull();
    // A frontend that cannot compile must not cost a 30s build VM to discover.
    expect(appHost.deploy).not.toHaveBeenCalled();
  });

  it("rolls back to the stored document without rebuilding", async () => {
    const { app, repo, store } = await seedBundledDraft(SOURCES);
    const appHost = makeAppHost();
    const deps = { appHost, repo, tenantId: TENANT };
    await proposeRelease(deps, { appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });

    const second = await repo.getOrCreateDraftVersion(app.id, {
      createdBy: "engenty.app-coder",
      kind: "agent",
    });
    await repo.updateVersion(second.id, {
      files: { ...SOURCES, "src/App.tsx": "export function App(){return null}" },
      manifest: makeManifest({
        entry: { backend: "server.js", frontend: "src/main.tsx" },
      }),
    });
    await proposeRelease(deps, { appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 2 });

    await rollbackRelease(deps, { appId: app.id, version: 1 });

    const redeployed = (appHost.deploy as ReturnType<typeof vi.fn>).mock
      .calls.at(-1)?.[1] as Record<string, string>;
    expect(redeployed["index.html"]).toContain("from a component");
    expect(store.versions[0].status).toBe("active");
  });
});

describe("rollbackRelease", () => {
  it("redeploys a previous version from stored source", async () => {
    const { app, repo, store } = await seedDraft();
    const appHost = makeAppHost();
    const deps = { appHost, repo, tenantId: TENANT };
    await proposeRelease(deps, { appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 1 });

    const second = await repo.getOrCreateDraftVersion(app.id, {
      createdBy: "engenty.app-coder",
      kind: "agent",
    });
    await repo.updateVersion(second.id, {
      files: { "index.html": "<h1>v2</h1>" },
      manifest: makeManifest(),
    });
    await proposeRelease(deps, { appId: app.id });
    await approveRelease(deps, { appId: app.id, version: 2 });

    await rollbackRelease(deps, { appId: app.id, version: 1 });

    const active = store.versions.filter((v) => v.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(1);
    // Rollback rebuilds from Postgres — it needs nothing from the host's
    // own state, which is the whole point of keeping source here.
    expect(appHost.deploy).toHaveBeenCalledTimes(3);
  });
});
