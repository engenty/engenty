import type {
  PluginHttpRoute,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import type {
  AppHostClient,
  AppHostDeployment,
} from "../lib/app-host-client.js";
import type {
  App,
  AppConfigEntry,
  AppDataEntry,
  AppManifest,
  AppVersion,
} from "../schema/types.js";
import { APP_MANIFEST_FILE } from "../schema/zod.js";
import type { AppsRepo } from "./gateway-methods.js";

export const defaultAuth = {
  principalId: "00000000-0000-4000-8000-000000000002",
  scopeId: "default",
  tenantId: "00000000-0000-4000-8000-000000000001",
};

export function makeMockApi() {
  const httpRoutes: PluginHttpRoute[] = [];
  const serverOperations: PluginServerOperation[] = [];
  const api = {
    callGatewayMethod: async () => null,
    hasOperation: () => false,
    registerAiRegistration: () => {},
    registerCli: () => {},
    registerFeatureFlags: () => [],
    registerHttpRoute: (route: PluginHttpRoute) => {
      httpRoutes.push(route);
    },
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
    },
    registerProfilePolicy: () => {},
    registerResultPolicy: () => {},
    registerRoleProfiles: () => {},
    registerService: () => {},
    registerTestDataType: () => {},
    resolvePath: (p: string) => p,
  } as unknown as PluginServerApi;
  return { api, defaultAuth, httpRoutes, serverOperations };
}

export function makeManifest(
  overrides: Partial<AppManifest> = {}
): AppManifest {
  return {
    actions: [
      { id: "collect", risk: "low", summary: "Collect a receipt" },
      {
        id: "finalize",
        requiresApproval: true,
        risk: "high",
        summary: "Submit the report",
      },
    ],
    egress: { connect: [] },
    engenty: { operations: ["inbox_threads_list"], tables: [] },
    entry: { backend: "server.js", frontend: "index.html" },
    name: "Travel expenses",
    storage: { config: true, data: true },
    ...overrides,
  };
}

export interface FakeAppsStore {
  apps: App[];
  config: AppConfigEntry[];
  data: AppDataEntry[];
  versions: AppVersion[];
}

/**
 * An app host with an in-memory repository per App: writes commit, reads
 * answer the tree at a commit, deploys are recorded. Enough to exercise the
 * release flow without git or a running host.
 */
export interface FakeAppHost extends AppHostClient {
  /** Every deploy, in order: the files the host was handed. */
  deploys: Record<string, string>[];
  /** commit sha → files, per App. */
  repos: Map<
    string,
    {
      commits: Map<string, Record<string, string>>;
      head: string | null;
      tree: Record<string, string>;
    }
  >;
}

export function makeFakeAppHost(
  overrides: Partial<AppHostClient> = {}
): FakeAppHost {
  const repos: FakeAppHost["repos"] = new Map();
  const deploys: Record<string, string>[] = [];
  let counter = 0;
  const repoOf = (appId: string) => {
    let repo = repos.get(appId);
    if (!repo) {
      repo = { commits: new Map(), head: null, tree: {} };
      repos.set(appId, repo);
    }
    return repo;
  };
  const host: FakeAppHost = {
    deploys,
    repos,
    deploy: async (appId): Promise<AppHostDeployment> => {
      const files = deploys.at(-1) ?? {};
      return {
        appId,
        namespace: "ns",
        pool: "pool",
        regions: ["default"],
        release: `rel-${Object.keys(files).length}-${deploys.length}`,
      };
    },
    destroy: async () => undefined,
    readSource: async (appId, ref) => {
      const repo = repoOf(appId);
      const sha = ref === "HEAD" ? repo.head : ref;
      const files = sha ? repo.commits.get(sha) : undefined;
      if (!(sha && files)) {
        throw new Error(`fake app host: unknown ref ${ref}`);
      }
      return { files: { ...files }, sha };
    },
    request: async () => ({ body: "{}", headers: {}, status: 200 }),
    writeSource: async (appId, _placement, write) => {
      const repo = repoOf(appId);
      for (const [path, content] of Object.entries(write.files ?? {})) {
        repo.tree[path] = content;
      }
      for (const path of write.delete ?? []) {
        delete repo.tree[path];
      }
      // Like git: the tree is compared with the last commit, so an edit made
      // directly in the tree before this call is committed too.
      const committed = repo.head
        ? JSON.stringify(repo.commits.get(repo.head))
        : null;
      if (repo.head && JSON.stringify(repo.tree) === committed) {
        return { changed: false, sha: repo.head };
      }
      counter += 1;
      const sha = `sha-${counter}`.padEnd(40, "0");
      repo.commits.set(sha, { ...repo.tree });
      repo.head = sha;
      return { changed: true, sha };
    },
    ...overrides,
  };
  // Record what each deploy was handed, whatever `deploy` was overridden to.
  const deploy = host.deploy;
  host.deploy = async (appId, placement, files) => {
    deploys.push(files);
    return deploy(appId, placement, files);
  };
  return host;
}

/** Commit a manifest and files into the fake host's repository for an App. */
export async function seedSource(
  host: FakeAppHost,
  hostAppId: string,
  manifest: AppManifest,
  files: Record<string, string>
): Promise<string> {
  const { sha } = await host.writeSource(
    hostAppId,
    { slug: "x", spaceId: null, tenantId: defaultAuth.tenantId },
    {
      files: { ...files, [APP_MANIFEST_FILE]: JSON.stringify(manifest) },
      message: "seed",
    }
  );
  return sha;
}

/**
 * In-memory repo covering everything the domain services touch, following the
 * fake-store pattern from modules/tasks. Enough to exercise the release state
 * machine and the call allow-list without a database.
 */
export function makeFakeAppsRepo(store: FakeAppsStore): AppsRepo {
  const now = () => new Date().toISOString();

  const repo: AppsRepo = {
    archiveOtherActiveVersions: async (appId, keepVersionId) => {
      for (const version of store.versions) {
        if (
          version.app_id === appId &&
          version.id !== keepVersionId &&
          version.status === "active"
        ) {
          version.status = "archived";
        }
      }
    },
    createApp: async (input, actor) => {
      const app: App = {
        active_version_id: null,
        created_at: now(),
        created_by: actor.createdBy,
        created_by_kind: actor.kind,
        description: input.description ?? null,
        id: `app-${store.apps.length + 1}`,
        name: input.name,
        scope_id: defaultAuth.scopeId,
        slug: input.slug,
        space_id: input.spaceId,
        status: "draft",
        tenant_id: defaultAuth.tenantId,
        updated_at: now(),
      };
      store.apps.push(app);
      return app;
    },
    deleteData: async ({ appId, key, sessionId }) => {
      store.data = store.data.filter(
        (entry) =>
          !(
            entry.app_id === appId &&
            entry.session_id === sessionId &&
            entry.key === key
          )
      );
    },
    deleteConfig: async ({ appId, key, userId }) => {
      store.config = store.config.filter(
        (entry) =>
          !(
            entry.app_id === appId &&
            entry.key === key &&
            entry.user_id === (userId ?? null)
          )
      );
    },
    getApp: async (id) => store.apps.find((app) => app.id === id) ?? null,
    getAppBySlug: async (slug) =>
      store.apps.find((app) => app.slug === slug) ?? null,
    getConfig: async ({ appId, key, userId }) =>
      store.config.find(
        (entry) =>
          entry.app_id === appId &&
          entry.key === key &&
          entry.user_id === (userId ?? null)
      ) ?? null,
    createVersion: async (input, actor) => {
      const highest = store.versions
        .filter((version) => version.app_id === input.appId)
        .reduce((max, version) => Math.max(max, version.version), 0);
      const version: AppVersion = {
        app_id: input.appId,
        build_log: null,
        created_at: now(),
        created_by: actor.createdBy,
        created_by_kind: actor.kind,
        deployed_at: null,
        frontend_html: null,
        id: `ver-${store.versions.length + 1}`,
        manifest: input.manifest,
        release: null,
        scope_id: defaultAuth.scopeId,
        sha: input.sha,
        status: "proposed",
        tenant_id: defaultAuth.tenantId,
        version: highest + 1,
      };
      store.versions.push(version);
      return version;
    },
    getData: async ({ appId, key, sessionId }) =>
      store.data.find(
        (entry) =>
          entry.app_id === appId &&
          entry.session_id === sessionId &&
          entry.key === key
      ) ?? null,
    getVersion: async (id) =>
      store.versions.find((version) => version.id === id) ?? null,
    getVersionByNumber: async (appId, versionNumber) =>
      store.versions.find(
        (version) =>
          version.app_id === appId && version.version === versionNumber
      ) ?? null,
    insertCapability: async (input) => ({
      allowed_operations: input.allowedOperations,
      app_id: input.appId,
      created_at: now(),
      expires_at: input.expiresAt,
      id: "cap-1",
      revoked_at: null,
      tenant_id: defaultAuth.tenantId,
      user_id: input.userId,
    }),
    listAllData: async (appId, sessionId) =>
      store.data.filter(
        (entry) =>
          entry.app_id === appId &&
          (!sessionId || entry.session_id === sessionId)
      ),
    listApps: async (filter) =>
      store.apps.filter(
        (app) => !filter?.status || app.status === filter.status
      ),
    listConfig: async ({ appId, prefix, userId }) => {
      const merged = new Map<string, AppConfigEntry>();
      for (const entry of store.config) {
        if (entry.app_id !== appId) {
          continue;
        }
        if (prefix && !entry.key.startsWith(prefix)) {
          continue;
        }
        if (entry.user_id !== null && entry.user_id !== (userId ?? null)) {
          continue;
        }
        const existing = merged.get(entry.key);
        // A user value shadows the default, mirroring the DAL's merge.
        if (
          !existing ||
          (existing.user_id === null && entry.user_id !== null)
        ) {
          merged.set(entry.key, entry);
        }
      }
      return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
    },
    listData: async ({ appId, prefix, sessionId }) =>
      store.data.filter(
        (entry) =>
          entry.app_id === appId &&
          entry.session_id === sessionId &&
          (!prefix || entry.key.startsWith(prefix))
      ),
    listVersions: async (appId) =>
      store.versions
        .filter((version) => version.app_id === appId)
        .sort((a, b) => b.version - a.version),
    resolveCapability: async () => null,
    resolveConfig: async ({ appId, key, userId }) =>
      store.config.find(
        (entry) =>
          entry.app_id === appId &&
          entry.key === key &&
          entry.user_id === userId
      ) ??
      store.config.find(
        (entry) =>
          entry.app_id === appId && entry.key === key && entry.user_id === null
      ) ??
      null,
    revokeCapability: async () => {},
    setConfig: async ({ appId, key, userId, value }) => {
      const level = userId ?? null;
      const existing = store.config.find(
        (entry) =>
          entry.app_id === appId && entry.key === key && entry.user_id === level
      );
      if (existing) {
        existing.value = value;
        existing.updated_at = now();
        return existing;
      }
      const entry: AppConfigEntry = {
        app_id: appId,
        created_at: now(),
        key,
        scope_id: defaultAuth.scopeId,
        tenant_id: defaultAuth.tenantId,
        updated_at: now(),
        user_id: level,
        value,
      };
      store.config.push(entry);
      return entry;
    },
    setData: async ({ appId, key, sessionId, value }) => {
      const existing = store.data.find(
        (entry) =>
          entry.app_id === appId &&
          entry.session_id === sessionId &&
          entry.key === key
      );
      if (existing) {
        existing.value = value;
        existing.updated_at = now();
        return existing;
      }
      const entry: AppDataEntry = {
        app_id: appId,
        created_at: now(),
        key,
        scope_id: defaultAuth.scopeId,
        session_id: sessionId,
        tenant_id: defaultAuth.tenantId,
        updated_at: now(),
        value,
      };
      store.data.push(entry);
      return entry;
    },
    updateApp: async (id, patch) => {
      const app = store.apps.find((candidate) => candidate.id === id);
      if (!app) {
        return null;
      }
      Object.assign(app, patch, { updated_at: now() });
      return app;
    },
    updateVersion: async (id, patch) => {
      const version = store.versions.find((candidate) => candidate.id === id);
      if (!version) {
        return null;
      }
      Object.assign(version, patch);
      return version;
    },
  };
  return repo;
}

export function makeFakeStore(): FakeAppsStore {
  return { apps: [], config: [], data: [], versions: [] };
}
