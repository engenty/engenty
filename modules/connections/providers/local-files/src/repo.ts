import type { SupabaseClient } from "@supabase/supabase-js";

const SCHEMA = "module_local_files";

export interface InstallationRow {
  device_label: string | null;
  installation_id: string;
  last_seen_at: string;
  tenant_id: string;
  user_id: string;
}

export interface DirectoryRow {
  connection_id: string;
  directory_name: string;
  installation_id: string;
  tenant_id: string;
}

export interface BridgeRequestRow {
  action: string;
  connection_id: string;
  created_at: string;
  error: string | null;
  error_code: string | null;
  id: string;
  input: unknown;
  installation_id: string;
  response: unknown;
  status: "pending" | "completed" | "error" | "expired";
}

function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) {
    throw new Error(`local-files repo: ${result.error.message}`);
  }
  return result.data;
}

export function createLocalFilesRepo(supabase: SupabaseClient) {
  const db = () => supabase.schema(SCHEMA);

  return {
    async upsertInstallationHeartbeat(input: {
      deviceLabel: string | null;
      installationId: string;
      tenantId: string;
      userId: string;
    }): Promise<void> {
      unwrap(
        await db().from("installations").upsert(
          {
            device_label: input.deviceLabel,
            installation_id: input.installationId,
            last_seen_at: new Date().toISOString(),
            tenant_id: input.tenantId,
            user_id: input.userId,
          },
          { onConflict: "installation_id" }
        )
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

    async upsertDirectory(input: DirectoryRow): Promise<void> {
      unwrap(
        await db()
          .from("directories")
          .upsert(input, { onConflict: "connection_id" })
      );
    },

    async getDirectoryByConnection(
      connectionId: string
    ): Promise<DirectoryRow | null> {
      const rows = unwrap(
        await db()
          .from("directories")
          .select("*")
          .eq("connection_id", connectionId)
      ) as DirectoryRow[];
      return rows[0] ?? null;
    },

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

    async listClaimableRequests(
      installationId: string
    ): Promise<BridgeRequestRow[]> {
      return unwrap(
        await db()
          .from("bridge_requests")
          .select("*")
          .eq("installation_id", installationId)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: true })
          .limit(20)
      ) as BridgeRequestRow[];
    },

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
          .eq("status", "pending")
      );
    },

    async expireRequest(id: string): Promise<void> {
      unwrap(
        await db()
          .from("bridge_requests")
          .update({ status: "expired" })
          .eq("id", id)
          .eq("status", "pending")
      );
    },
  };
}

export type LocalFilesRepo = ReturnType<typeof createLocalFilesRepo>;
