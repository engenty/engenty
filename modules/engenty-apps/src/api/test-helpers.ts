import type {
  PluginHttpRoute,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import type { AppsRepo } from "./gateway-methods.js";
import type {
  App,
  AppConfigEntry,
  AppDataEntry,
  AppManifest,
  AppVersion,
} from "../schema/types.js";

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

export function makeManifest(overrides: Partial<AppManifest> = {}): AppManifest {
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
    engenty: { operations: ["inbox_threads_list"] },
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
    getConsent: async () => null,
    getData: async ({ appId, key, sessionId }) =>
      store.data.find(
        (entry) =>
          entry.app_id === appId &&
          entry.session_id === sessionId &&
          entry.key === key
      ) ?? null,
    getOrCreateDraftVersion: async (appId, actor) => {
      const existing = store.versions.find(
        (version) => version.app_id === appId && version.status === "proposed"
      );
      if (existing) {
        return existing;
      }
      const highest = store.versions
        .filter((version) => version.app_id === appId)
        .reduce((max, version) => Math.max(max, version.version), 0);
      const draft: AppVersion = {
        app_id: appId,
        build_log: null,
        created_at: now(),
        created_by: actor.createdBy,
        created_by_kind: actor.kind,
        deployed_at: null,
        files: {},
        frontend_html: null,
        id: `ver-${store.versions.length + 1}`,
        manifest: makeManifest(),
        release: null,
        scope_id: defaultAuth.scopeId,
        status: "proposed",
        tenant_id: defaultAuth.tenantId,
        version: highest + 1,
      };
      store.versions.push(draft);
      return draft;
    },
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
      store.apps.filter((app) => !filter?.status || app.status === filter.status),
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
        if (!existing || (existing.user_id === null && entry.user_id !== null)) {
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
    recordConsent: async () => {},
    resolveCapability: async () => null,
    resolveConfig: async ({ appId, key, userId }) =>
      store.config.find(
        (entry) =>
          entry.app_id === appId && entry.key === key && entry.user_id === userId
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
          entry.app_id === appId &&
          entry.key === key &&
          entry.user_id === level
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
