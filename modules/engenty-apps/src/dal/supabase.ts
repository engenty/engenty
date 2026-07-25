import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  ActorKind,
  App,
  AppCapability,
  AppConfigEntry,
  AppDataEntry,
  AppManifest,
  AppVersion,
  AppVersionStatus,
} from "../schema/types.js";

const SCHEMA = "module_apps";

const EMPTY_MANIFEST: AppManifest = {
  actions: [],
  egress: { connect: [] },
  engenty: { operations: [] },
  entry: { frontend: "index.html" },
  name: "",
  storage: { config: false, data: false },
};

function rowToApp(row: Record<string, unknown>): App {
  return {
    active_version_id: (row.active_version_id as string | null) ?? null,
    created_at: String(row.created_at),
    created_by: (row.created_by as string | null) ?? null,
    created_by_kind: row.created_by_kind as ActorKind,
    description: (row.description as string | null) ?? null,
    id: String(row.id),
    name: String(row.name),
    scope_id: String(row.scope_id),
    slug: String(row.slug),
    status: row.status as App["status"],
    tenant_id: String(row.tenant_id),
    updated_at: String(row.updated_at),
  };
}

function rowToVersion(row: Record<string, unknown>): AppVersion {
  return {
    app_id: String(row.app_id),
    build_log: (row.build_log as string | null) ?? null,
    created_at: String(row.created_at),
    created_by: (row.created_by as string | null) ?? null,
    created_by_kind: row.created_by_kind as ActorKind,
    deployed_at: (row.deployed_at as string | null) ?? null,
    files: (row.files as Record<string, string> | null) ?? {},
    id: String(row.id),
    manifest: (row.manifest as AppManifest | null) ?? EMPTY_MANIFEST,
    release: (row.release as string | null) ?? null,
    scope_id: String(row.scope_id),
    status: row.status as AppVersionStatus,
    tenant_id: String(row.tenant_id),
    version: Number(row.version),
  };
}

function rowToDataEntry(row: Record<string, unknown>): AppDataEntry {
  return {
    app_id: String(row.app_id),
    created_at: String(row.created_at),
    key: String(row.key),
    scope_id: String(row.scope_id),
    session_id: String(row.session_id),
    tenant_id: String(row.tenant_id),
    updated_at: String(row.updated_at),
    value: row.value,
  };
}

function rowToConfigEntry(row: Record<string, unknown>): AppConfigEntry {
  return {
    app_id: String(row.app_id),
    created_at: String(row.created_at),
    key: String(row.key),
    scope_id: String(row.scope_id),
    tenant_id: String(row.tenant_id),
    updated_at: String(row.updated_at),
    user_id: row.user_id == null ? null : String(row.user_id),
    value: row.value,
  };
}

export type AppsRepoSupabase = ReturnType<typeof createAppsRepoSupabase>;

/**
 * The service-role client bypasses RLS, so every query filters tenant_id and
 * scope_id explicitly — that filter, not the policy, is what actually keeps
 * tenants apart on this path.
 */
export function createAppsRepoSupabase(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
) {
  const apps = () => supabase.schema(SCHEMA).from("apps");
  const versions = () => supabase.schema(SCHEMA).from("app_versions");
  const capabilities = () => supabase.schema(SCHEMA).from("app_capability");
  const consents = () => supabase.schema(SCHEMA).from("app_consent");
  const data = () => supabase.schema(SCHEMA).from("app_data");
  const config = () => supabase.schema(SCHEMA).from("app_config");

  return {
    async listApps(filter?: { status?: App["status"] }): Promise<App[]> {
      let query = apps()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("updated_at", { ascending: false });
      if (filter?.status) {
        query = query.eq("status", filter.status);
      }
      const { data: rows, error } = await query;
      if (error) {
        throw new Error(`Failed to list apps: ${error.message}`);
      }
      return (rows ?? []).map((row) => rowToApp(row as Record<string, unknown>));
    },

    async getApp(id: string): Promise<App | null> {
      const { data: row, error } = await apps()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get app: ${error.message}`);
      }
      return row ? rowToApp(row as Record<string, unknown>) : null;
    },

    async getAppBySlug(slug: string): Promise<App | null> {
      const { data: row, error } = await apps()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("slug", slug)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get app by slug: ${error.message}`);
      }
      return row ? rowToApp(row as Record<string, unknown>) : null;
    },

    async createApp(
      input: {
        description?: string | null;
        name: string;
        slug: string;
      },
      actor: { createdBy: string | null; kind: ActorKind }
    ): Promise<App> {
      const row = {
        created_by: actor.createdBy,
        created_by_kind: actor.kind,
        description: input.description ?? null,
        id: uuidv7(),
        name: input.name,
        scope_id: scopeId,
        slug: input.slug,
        status: "draft" as const,
        tenant_id: tenantId,
      };
      const { data: inserted, error } = await apps()
        .insert(row)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create app: ${error.message}`);
      }
      return rowToApp((inserted ?? row) as Record<string, unknown>);
    },

    async updateApp(
      id: string,
      patch: {
        active_version_id?: string | null;
        description?: string | null;
        name?: string;
        status?: App["status"];
      }
    ): Promise<App | null> {
      const { data: row, error } = await apps()
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to update app: ${error.message}`);
      }
      return row ? rowToApp(row as Record<string, unknown>) : null;
    },

    async listVersions(appId: string): Promise<AppVersion[]> {
      const { data: rows, error } = await versions()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", appId)
        .order("version", { ascending: false });
      if (error) {
        throw new Error(`Failed to list app versions: ${error.message}`);
      }
      return (rows ?? []).map((row) =>
        rowToVersion(row as Record<string, unknown>)
      );
    },

    async getVersion(id: string): Promise<AppVersion | null> {
      const { data: row, error } = await versions()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get app version: ${error.message}`);
      }
      return row ? rowToVersion(row as Record<string, unknown>) : null;
    },

    async getVersionByNumber(
      appId: string,
      version: number
    ): Promise<AppVersion | null> {
      const { data: row, error } = await versions()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", appId)
        .eq("version", version)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get app version: ${error.message}`);
      }
      return row ? rowToVersion(row as Record<string, unknown>) : null;
    },

    /** The single draft a coder writes into, created on first write. */
    async getOrCreateDraftVersion(
      appId: string,
      actor: { createdBy: string | null; kind: ActorKind }
    ): Promise<AppVersion> {
      const existing = await versions()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", appId)
        .eq("status", "proposed")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing.error) {
        throw new Error(`Failed to load draft: ${existing.error.message}`);
      }
      if (existing.data) {
        return rowToVersion(existing.data as Record<string, unknown>);
      }

      const latest = await versions()
        .select("version")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", appId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest.error) {
        throw new Error(
          `Failed to resolve next version: ${latest.error.message}`
        );
      }
      const nextVersion =
        Number((latest.data as { version?: number } | null)?.version ?? 0) + 1;

      const row = {
        app_id: appId,
        created_by: actor.createdBy,
        created_by_kind: actor.kind,
        files: {},
        id: uuidv7(),
        manifest: {},
        scope_id: scopeId,
        status: "proposed" as const,
        tenant_id: tenantId,
        version: nextVersion,
      };
      const { data: inserted, error } = await versions()
        .insert(row)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create draft version: ${error.message}`);
      }
      return rowToVersion((inserted ?? row) as Record<string, unknown>);
    },

    async updateVersion(
      id: string,
      patch: {
        build_log?: string | null;
        deployed_at?: string | null;
        files?: Record<string, string>;
        manifest?: AppManifest;
        release?: string | null;
        status?: AppVersionStatus;
      }
    ): Promise<AppVersion | null> {
      const { data: row, error } = await versions()
        .update(patch)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to update app version: ${error.message}`);
      }
      return row ? rowToVersion(row as Record<string, unknown>) : null;
    },

    /** Archive every other active version so exactly one can be live. */
    async archiveOtherActiveVersions(
      appId: string,
      keepVersionId: string
    ): Promise<void> {
      const { error } = await versions()
        .update({ status: "archived" as const })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", appId)
        .eq("status", "active")
        .neq("id", keepVersionId);
      if (error) {
        throw new Error(`Failed to archive prior versions: ${error.message}`);
      }
    },

    async insertCapability(input: {
      allowedOperations: string[];
      appId: string;
      expiresAt: string;
      tokenHash: string;
      userId: string;
    }): Promise<AppCapability> {
      const row = {
        allowed_operations: input.allowedOperations,
        app_id: input.appId,
        expires_at: input.expiresAt,
        id: uuidv7(),
        tenant_id: tenantId,
        token_hash: input.tokenHash,
        user_id: input.userId,
      };
      const { data: inserted, error } = await capabilities()
        .insert(row)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to mint capability: ${error.message}`);
      }
      const created = (inserted ?? row) as Record<string, unknown>;
      return {
        allowed_operations:
          (created.allowed_operations as string[] | null) ?? [],
        app_id: String(created.app_id),
        created_at: String(created.created_at ?? new Date().toISOString()),
        expires_at: String(created.expires_at),
        id: String(created.id),
        revoked_at: (created.revoked_at as string | null) ?? null,
        tenant_id: String(created.tenant_id),
        user_id: String(created.user_id),
      };
    },

    /** Resolve a presented handle. Returns null when expired or revoked. */
    async resolveCapability(tokenHash: string): Promise<AppCapability | null> {
      const { data: row, error } = await capabilities()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to resolve capability: ${error.message}`);
      }
      if (!row) {
        return null;
      }
      const found = row as Record<string, unknown>;
      return {
        allowed_operations: (found.allowed_operations as string[] | null) ?? [],
        app_id: String(found.app_id),
        created_at: String(found.created_at),
        expires_at: String(found.expires_at),
        id: String(found.id),
        revoked_at: null,
        tenant_id: String(found.tenant_id),
        user_id: String(found.user_id),
      };
    },

    async revokeCapability(id: string): Promise<void> {
      const { error } = await capabilities()
        .update({ revoked_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", id);
      if (error) {
        throw new Error(`Failed to revoke capability: ${error.message}`);
      }
    },

    async getConsent(input: {
      appId: string;
      appVersion: number;
      userId: string;
    }): Promise<string[] | null> {
      const { data: row, error } = await consents()
        .select("operations")
        .eq("tenant_id", tenantId)
        .eq("app_id", input.appId)
        .eq("app_version", input.appVersion)
        .eq("user_id", input.userId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to read consent: ${error.message}`);
      }
      return row ? ((row as { operations: string[] }).operations ?? []) : null;
    },

    async recordConsent(input: {
      appId: string;
      appVersion: number;
      operations: string[];
      userId: string;
    }): Promise<void> {
      const { error } = await consents().upsert(
        {
          app_id: input.appId,
          app_version: input.appVersion,
          id: uuidv7(),
          operations: input.operations,
          tenant_id: tenantId,
          user_id: input.userId,
        },
        { onConflict: "tenant_id,app_id,app_version,user_id" }
      );
      if (error) {
        throw new Error(`Failed to record consent: ${error.message}`);
      }
    },

    async getData(input: {
      appId: string;
      key: string;
      sessionId: string;
    }): Promise<AppDataEntry | null> {
      const { data: row, error } = await data()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", input.appId)
        .eq("session_id", input.sessionId)
        .eq("key", input.key)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to read app data: ${error.message}`);
      }
      return row ? rowToDataEntry(row as Record<string, unknown>) : null;
    },

    async listData(input: {
      appId: string;
      prefix?: string;
      sessionId: string;
    }): Promise<AppDataEntry[]> {
      let query = data()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", input.appId)
        .eq("session_id", input.sessionId)
        .order("key", { ascending: true });
      if (input.prefix) {
        query = query.like("key", `${input.prefix}%`);
      }
      const { data: rows, error } = await query;
      if (error) {
        throw new Error(`Failed to list app data: ${error.message}`);
      }
      return (rows ?? []).map((row) =>
        rowToDataEntry(row as Record<string, unknown>)
      );
    },

    async listAllData(
      appId: string,
      sessionId?: string
    ): Promise<AppDataEntry[]> {
      let query = data()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", appId)
        .order("session_id", { ascending: true })
        .order("key", { ascending: true });
      if (sessionId) {
        query = query.eq("session_id", sessionId);
      }
      const { data: rows, error } = await query;
      if (error) {
        throw new Error(`Failed to export app data: ${error.message}`);
      }
      return (rows ?? []).map((row) =>
        rowToDataEntry(row as Record<string, unknown>)
      );
    },

    async setData(input: {
      appId: string;
      key: string;
      sessionId: string;
      value: unknown;
    }): Promise<AppDataEntry> {
      const now = new Date().toISOString();
      const row = {
        app_id: input.appId,
        id: uuidv7(),
        key: input.key,
        scope_id: scopeId,
        session_id: input.sessionId,
        tenant_id: tenantId,
        updated_at: now,
        value: input.value,
      };
      const { data: upserted, error } = await data()
        .upsert(row, { onConflict: "tenant_id,app_id,session_id,key" })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to write app data: ${error.message}`);
      }
      return rowToDataEntry(
        (upserted ?? { ...row, created_at: now }) as Record<string, unknown>
      );
    },

    async deleteData(input: {
      appId: string;
      key: string;
      sessionId: string;
    }): Promise<void> {
      const { error } = await data()
        .delete()
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", input.appId)
        .eq("session_id", input.sessionId)
        .eq("key", input.key);
      if (error) {
        throw new Error(`Failed to delete app data: ${error.message}`);
      }
    },

    async getConfig(input: {
      appId: string;
      key: string;
      userId?: string | null;
    }): Promise<AppConfigEntry | null> {
      const base = config()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", input.appId)
        .eq("key", input.key);
      const { data: row, error } = await (input.userId
        ? base.eq("user_id", input.userId)
        : base.is("user_id", null)
      ).maybeSingle();
      if (error) {
        throw new Error(`Failed to read app config: ${error.message}`);
      }
      return row ? rowToConfigEntry(row as Record<string, unknown>) : null;
    },

    /**
     * The read an App actually makes: the user's own value if they have set
     * one, otherwise the tenant-wide default. Called with no userId this is
     * just the default.
     */
    async resolveConfig(input: {
      appId: string;
      key: string;
      userId?: string | null;
    }): Promise<AppConfigEntry | null> {
      if (input.userId) {
        const own = await this.getConfig(input);
        if (own) {
          return own;
        }
      }
      return await this.getConfig({
        appId: input.appId,
        key: input.key,
        userId: null,
      });
    },

    async listConfig(input: {
      appId: string;
      prefix?: string;
      userId?: string | null;
    }): Promise<AppConfigEntry[]> {
      let query = config()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", input.appId)
        .order("key", { ascending: true });
      if (input.prefix) {
        query = query.like("key", `${input.prefix}%`);
      }
      // Both levels in one round trip, merged below — a user's value shadows
      // the default for the same key, which is the same rule resolveConfig
      // applies to a single key.
      query = input.userId
        ? query.or(`user_id.is.null,user_id.eq.${input.userId}`)
        : query.is("user_id", null);
      const { data: rows, error } = await query;
      if (error) {
        throw new Error(`Failed to list app config: ${error.message}`);
      }
      const merged = new Map<string, AppConfigEntry>();
      for (const raw of rows ?? []) {
        const entry = rowToConfigEntry(raw as Record<string, unknown>);
        const existing = merged.get(entry.key);
        if (!existing || (existing.user_id === null && entry.user_id !== null)) {
          merged.set(entry.key, entry);
        }
      }
      return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
    },

    async setConfig(input: {
      appId: string;
      key: string;
      userId?: string | null;
      value: unknown;
    }): Promise<AppConfigEntry> {
      const now = new Date().toISOString();

      // No .upsert() here: uniqueness is enforced by two PARTIAL indexes (see
      // the migration), and `on conflict` cannot name a partial index through
      // PostgREST. Update-then-insert is the honest equivalent — and the index
      // still backstops a lost race, which we resolve by retrying the update.
      //
      // The level filter is spelled out at each call site rather than factored
      // into a helper: a generic over Supabase's builder types makes tsc give
      // up with TS2589 ("type instantiation is excessively deep").
      const updateQuery = config()
        .update({ updated_at: now, value: input.value })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", input.appId)
        .eq("key", input.key);
      const updated = await (input.userId
        ? updateQuery.eq("user_id", input.userId)
        : updateQuery.is("user_id", null)
      ).select();
      if (updated.error) {
        throw new Error(`Failed to write app config: ${updated.error.message}`);
      }
      if (updated.data && updated.data.length > 0) {
        return rowToConfigEntry(updated.data[0] as Record<string, unknown>);
      }

      const row = {
        app_id: input.appId,
        created_at: now,
        id: uuidv7(),
        key: input.key,
        scope_id: scopeId,
        tenant_id: tenantId,
        updated_at: now,
        user_id: input.userId ?? null,
        value: input.value,
      };
      const inserted = await config().insert(row).select().single();
      if (!inserted.error) {
        return rowToConfigEntry(inserted.data as Record<string, unknown>);
      }
      // 23505 = unique violation: a concurrent writer inserted the same level
      // between our update and our insert. Their row is now the one to update.
      if ((inserted.error as { code?: string }).code !== "23505") {
        throw new Error(`Failed to write app config: ${inserted.error.message}`);
      }
      const retryQuery = config()
        .update({ updated_at: now, value: input.value })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", input.appId)
        .eq("key", input.key);
      const retried = await (input.userId
        ? retryQuery.eq("user_id", input.userId)
        : retryQuery.is("user_id", null)
      )
        .select()
        .single();
      if (retried.error) {
        throw new Error(`Failed to write app config: ${retried.error.message}`);
      }
      return rowToConfigEntry(retried.data as Record<string, unknown>);
    },

    async deleteConfig(input: {
      appId: string;
      key: string;
      userId?: string | null;
    }): Promise<void> {
      const base = config()
        .delete()
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("app_id", input.appId)
        .eq("key", input.key);
      const { error } = await (input.userId
        ? base.eq("user_id", input.userId)
        : base.is("user_id", null));
      if (error) {
        throw new Error(`Failed to delete app config: ${error.message}`);
      }
    },
  };
}
