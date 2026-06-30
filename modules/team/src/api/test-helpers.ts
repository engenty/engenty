import { randomUUID } from "node:crypto";
import type {
  PluginHttpRoute,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import type {
  TeamMember,
  TeamMemberInput,
  TeamMembersPaginatedResponse,
  TeamMembersQueryParams,
  TeamMemberUpdateInput,
} from "../schema/types.js";

export function makeMockTeamMemberRepo() {
  const store = new Map<string, TeamMember>();

  return {
    async create(input: TeamMemberInput): Promise<TeamMember> {
      const id = randomUUID();
      const now = new Date().toISOString();
      const member: TeamMember = {
        id,
        tenant_id: "tenant-1",
        scope_id: "default",
        user_id: input.user_id ?? null,
        member_type: input.member_type ?? "internal",
        full_name: input.full_name ?? "",
        name_prefix: input.name_prefix ?? null,
        first_name: input.first_name ?? null,
        middle_name: input.middle_name ?? null,
        last_name: input.last_name ?? null,
        name_suffix: input.name_suffix ?? null,
        phonetic_name: input.phonetic_name ?? null,
        birth_name: input.birth_name ?? null,
        full_name_override: input.full_name_override ?? null,
        initials: input.initials ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        position: input.position ?? null,
        department: input.department ?? null,
        location: input.location ?? null,
        profile_image_storage_key: input.profile_image_storage_key ?? null,
        import_id: input.import_id ?? null,
        last_imported_at: input.last_imported_at ?? null,
        created_at: now,
        updated_at: now,
      };
      store.set(id, member);
      return member;
    },
    async listPaginated(
      params: TeamMembersQueryParams = {}
    ): Promise<TeamMembersPaginatedResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 1000);
      let items = Array.from(store.values());
      if (params.search?.trim()) {
        const s = params.search.trim().toLowerCase();
        items = items.filter(
          (m) =>
            m.full_name.toLowerCase().includes(s) ||
            (m.position ?? "").toLowerCase().includes(s) ||
            (m.department ?? "").toLowerCase().includes(s)
        );
      }
      const total = items.length;
      const start = (page - 1) * pageSize;
      const data = items.slice(start, start + pageSize);
      return { data, total, page, pageSize };
    },
    async getById(id: string): Promise<TeamMember | null> {
      return store.get(id) ?? null;
    },
    async getByImportId(importId: string): Promise<TeamMember | null> {
      const found = Array.from(store.values()).find(
        (m) => m.import_id === importId
      );
      return found ?? null;
    },
    async getByEmail(email: string): Promise<TeamMember | null> {
      const normalized = email.trim().toLowerCase();
      const found = Array.from(store.values()).find(
        (m) => m.email?.trim().toLowerCase() === normalized
      );
      return found ?? null;
    },
    async update(
      id: string,
      input: TeamMemberUpdateInput
    ): Promise<TeamMember | null> {
      const existing = store.get(id);
      if (!existing) {
        return null;
      }
      const updated: TeamMember = {
        ...existing,
        ...input,
        updated_at: new Date().toISOString(),
      };
      store.set(id, updated);
      return updated;
    },
    async delete(id: string): Promise<boolean> {
      return store.delete(id);
    },
    async listTimeTrackingCatalog(): Promise<
      { id: string; full_name: string; user_id: string | null }[]
    > {
      return Array.from(store.values())
        .slice()
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map((m) => ({
          id: m.id,
          full_name: m.full_name,
          user_id: m.user_id,
        }));
    },
    async findActorForPrincipal(
      principalId: string
    ): Promise<{ id: string; full_name: string } | null> {
      const found = Array.from(store.values()).find(
        (m) => m.user_id === principalId
      );
      return found ? { id: found.id, full_name: found.full_name } : null;
    },
  };
}

const defaultAuth = {
  tenantId: "tenant-1",
  scopeId: "default",
  principalId: "user-1",
};

export interface MakeMockApiOptions {
  hasOperation?: (operationId: string) => boolean;
  /** Mock host gateway dispatch (same contract as plugin server gateway invoke). */
  invokeGateway?: (
    methodName: string,
    input?: unknown,
    options?: { auth?: unknown }
  ) => Promise<unknown | null>;
}

const gatewayMethodKey = "callGatewayMethod";

export function makeMockApi(options?: MakeMockApiOptions) {
  const httpRoutes: PluginHttpRoute[] = [];
  const serverOperations: PluginServerOperation[] = [];
  const invokeGateway =
    options?.invokeGateway ?? (async () => null as unknown | null);
  const hasOperation =
    options?.hasOperation ?? ((_operationId: string) => false);
  const api = {
    id: "team",
    source: "/modules/team/index.ts",
    config: {},
    pluginConfig: {},
    resolvePath: (p: string) => p,
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    registerHttpRoute: (route: PluginHttpRoute) => {
      httpRoutes.push(route);
    },
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
    },
    registerCli: () => {},
    registerService: () => {},
    hasOperation,
    [gatewayMethodKey]: invokeGateway,
    registerFeatureFlags: () => {},
  } as unknown as PluginServerApi;
  return {
    api,
    callGatewayMethod: invokeGateway,
    httpRoutes,
    serverOperations,
    defaultAuth,
  };
}

export function getRoute(
  routes: PluginHttpRoute[],
  method: PluginHttpRoute["method"],
  routePath: string
): PluginHttpRoute {
  const found = routes.find((r) => r.method === method && r.path === routePath);
  if (!found) {
    throw new Error(`route not found: ${method.toUpperCase()} ${routePath}`);
  }
  return found;
}
