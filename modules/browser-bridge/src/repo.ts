import type { SupabaseClient } from "@supabase/supabase-js";

const SCHEMA = "module_browser_bridge";

export interface InstallationRow {
  allowed_origins: string[];
  connection_id: string | null;
  device_label: string;
  installation_id: string;
  last_seen_at: string;
  tenant_id: string;
  user_id: string;
}

export interface BridgeSessionRow {
  created_at: string;
  ended_at: string | null;
  id: string;
  installation_id: string;
  status: "active" | "ended";
  tenant_id: string;
  thread_id: string | null;
  user_id: string;
  window_state: unknown;
}

export interface BridgeRequestRow {
  action: string;
  connection_id: string;
  created_at: string;
  error: string | null;
  error_code: string | null;
  expires_at: string;
  id: string;
  input: unknown;
  installation_id: string;
  response: unknown;
  status: "pending" | "claimed" | "completed" | "error" | "expired";
}

function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) {
    throw new Error(`browser-bridge repo: ${result.error.message}`);
  }
  return result.data;
}

export function createBrowserBridgeRepo(supabase: SupabaseClient) {
  const db = () => supabase.schema(SCHEMA);

  return {
    // --- installations ---

    async insertInstallation(input: {
      allowedOrigins: string[];
      connectionId: string;
      deviceLabel: string;
      installationId: string;
      tenantId: string;
      userId: string;
    }): Promise<void> {
      unwrap(
        await db().from("installations").insert({
          allowed_origins: input.allowedOrigins,
          connection_id: input.connectionId,
          device_label: input.deviceLabel,
          installation_id: input.installationId,
          tenant_id: input.tenantId,
          user_id: input.userId,
        })
      );
    },

    async getInstallation(
      installationId: string
    ): Promise<InstallationRow | null> {
      const rows = unwrap(
        await db()
          .from("installations")
          .select("*")
          .eq("installation_id", installationId)
      ) as InstallationRow[];
      return rows[0] ?? null;
    },

    async getInstallationByConnection(
      connectionId: string
    ): Promise<InstallationRow | null> {
      const rows = unwrap(
        await db()
          .from("installations")
          .select("*")
          .eq("connection_id", connectionId)
      ) as InstallationRow[];
      return rows[0] ?? null;
    },

    async getLatestInstallationForUser(input: {
      tenantId: string;
      userId: string;
    }): Promise<InstallationRow | null> {
      const rows = unwrap(
        await db()
          .from("installations")
          .select("*")
          .eq("tenant_id", input.tenantId)
          .eq("user_id", input.userId)
          .order("created_at", { ascending: false })
          .limit(1)
      ) as InstallationRow[];
      return rows[0] ?? null;
    },

    async touchInstallation(installationId: string): Promise<void> {
      unwrap(
        await db()
          .from("installations")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("installation_id", installationId)
      );
    },

    async setAllowedOrigins(input: {
      allowedOrigins: string[];
      installationId: string;
    }): Promise<void> {
      unwrap(
        await db()
          .from("installations")
          .update({ allowed_origins: input.allowedOrigins })
          .eq("installation_id", input.installationId)
      );
    },

    // --- bridge sessions ---

    async createSession(input: {
      installationId: string;
      tenantId: string;
      userId: string;
    }): Promise<BridgeSessionRow> {
      const rows = unwrap(
        await db()
          .from("bridge_sessions")
          .insert({
            installation_id: input.installationId,
            status: "active",
            tenant_id: input.tenantId,
            user_id: input.userId,
          })
          .select("*")
      ) as BridgeSessionRow[];
      return rows[0];
    },

    async getActiveSession(
      installationId: string
    ): Promise<BridgeSessionRow | null> {
      const rows = unwrap(
        await db()
          .from("bridge_sessions")
          .select("*")
          .eq("installation_id", installationId)
          .eq("status", "active")
      ) as BridgeSessionRow[];
      return rows[0] ?? null;
    },

    async setSessionThread(input: {
      installationId: string;
      threadId: string | null;
    }): Promise<void> {
      unwrap(
        await db()
          .from("bridge_sessions")
          .update({ thread_id: input.threadId })
          .eq("installation_id", input.installationId)
          .eq("status", "active")
      );
    },

    async setSessionWindowState(input: {
      installationId: string;
      windowState: unknown;
    }): Promise<void> {
      unwrap(
        await db()
          .from("bridge_sessions")
          .update({ window_state: input.windowState })
          .eq("installation_id", input.installationId)
          .eq("status", "active")
      );
    },

    async endSession(installationId: string): Promise<void> {
      unwrap(
        await db()
          .from("bridge_sessions")
          .update({ ended_at: new Date().toISOString(), status: "ended" })
          .eq("installation_id", installationId)
          .eq("status", "active")
      );
    },

    // --- bridge requests ---

    async insertRequest(input: {
      action: string;
      connectionId: string;
      expiresAt: Date;
      input: unknown;
      installationId: string;
      tenantId: string;
    }): Promise<BridgeRequestRow> {
      const rows = unwrap(
        await db()
          .from("bridge_requests")
          .insert({
            action: input.action,
            connection_id: input.connectionId,
            expires_at: input.expiresAt.toISOString(),
            input: input.input,
            installation_id: input.installationId,
            status: "pending",
            tenant_id: input.tenantId,
          })
          .select("*")
      ) as BridgeRequestRow[];
      return rows[0];
    },

    async getRequest(id: string): Promise<BridgeRequestRow | null> {
      const rows = unwrap(
        await db().from("bridge_requests").select("*").eq("id", id)
      ) as BridgeRequestRow[];
      return rows[0] ?? null;
    },

    /**
     * Claim-once: flip every non-expired pending request for the installation
     * to `claimed` and return the claimed rows. A request is handed to the
     * extension exactly once — a service worker killed mid-command leaves a
     * `claimed` row that the awaiting server times out (never re-delivered).
     */
    async claimPendingRequests(
      installationId: string
    ): Promise<BridgeRequestRow[]> {
      const rows = unwrap(
        await db()
          .from("bridge_requests")
          .update({ status: "claimed" })
          .eq("installation_id", installationId)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .select("*")
      ) as BridgeRequestRow[];
      return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    },

    /** Complete guarded on `claimed`: only a claimed request may resolve. */
    async completeRequest(input: {
      errorCode?: string | null;
      errorText?: string | null;
      id: string;
      ok: boolean;
      response?: unknown;
    }): Promise<void> {
      unwrap(
        await db()
          .from("bridge_requests")
          .update({
            error: input.ok ? null : (input.errorText ?? "error"),
            error_code: input.ok ? null : (input.errorCode ?? null),
            response: input.ok ? (input.response ?? null) : null,
            status: input.ok ? "completed" : "error",
          })
          .eq("id", input.id)
          .eq("status", "claimed")
      );
    },

    /** Expire a request the extension never resolved (pending or claimed). */
    async expireRequest(id: string): Promise<void> {
      unwrap(
        await db()
          .from("bridge_requests")
          .update({ status: "expired" })
          .eq("id", id)
          .in("status", ["pending", "claimed"])
      );
    },
  };
}

export type BrowserBridgeRepo = ReturnType<typeof createBrowserBridgeRepo>;
