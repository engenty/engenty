import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { TeamMemberContract } from "../schema/hr-records.js";

const BUCKET = "module-team-contracts";

function rowToContract(row: Record<string, unknown>): TeamMemberContract {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    profile_id: String(row.profile_id),
    file_name: String(row.file_name ?? ""),
    file_path: String(row.file_path ?? ""),
    file_size: Number(row.file_size ?? 0),
    uploaded_at: String(row.uploaded_at),
    uploaded_by: (row.uploaded_by as string | null) ?? null,
  };
}

export type TeamMemberContractsRepoSupabase = ReturnType<
  typeof createTeamMemberContractsRepoSupabase
>;

export function createTeamMemberContractsRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_team";
  const table = () => supabase.schema(schema).from("team_member_contracts");

  return {
    async listByProfileId(profileId: string): Promise<TeamMemberContract[]> {
      const { data, error } = await table()
        .select("*")
        .eq("profile_id", profileId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("uploaded_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to list contracts: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToContract(row as Record<string, unknown>)
      );
    },

    async add(
      profileId: string,
      file: { name: string; data: Blob | ArrayBuffer; size: number },
      uploadedBy: string
    ): Promise<TeamMemberContract> {
      const id = uuidv7();
      const filePath = `${tenantId}/${profileId}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file.data);

      if (uploadError) {
        throw new Error(`Failed to upload contract: ${uploadError.message}`);
      }

      const now = new Date().toISOString();
      const row = {
        id,
        tenant_id: tenantId,
        scope_id: scopeId,
        profile_id: profileId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        uploaded_at: now,
        uploaded_by: uploadedBy,
      };

      const { data, error } = await table().insert(row).select().single();

      if (error) {
        throw new Error(`Failed to save contract record: ${error.message}`);
      }
      return rowToContract((data ?? row) as Record<string, unknown>);
    },

    async getById(id: string): Promise<TeamMemberContract | null> {
      const { data, error } = await table()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .single();

      if (error || !data) {
        return null;
      }
      return rowToContract(data as Record<string, unknown>);
    },

    async delete(id: string): Promise<boolean> {
      const contract = await this.getById(id);
      if (!contract) {
        return false;
      }

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([contract.file_path]);
      if (storageError) {
        throw new Error(
          `Failed to remove file from storage: ${storageError.message}`
        );
      }

      const { error } = await table()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (error) {
        throw new Error(`Failed to delete contract record: ${error.message}`);
      }
      return true;
    },

    async getDownloadUrl(
      filePath: string,
      expiresIn = 3600
    ): Promise<{ data: { signedUrl: string } | null }> {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(filePath, expiresIn);
      return { data };
    },
  };
}
