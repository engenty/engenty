import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./supabase-config.js";

export type SatelliteStatus =
  | "provisioning"
  | "active"
  | "suspended"
  | "error"
  | "archived";

export interface SatelliteEndpoints {
  apiUrl?: string;
  gotrueUrl?: string;
  postgresMetaUrl?: string;
  storageUrl?: string;
  studioUrl?: string;
}

export type SatelliteHealthStatus = "unknown" | "healthy" | "degraded" | "down";

export interface SatelliteHealth {
  checkedAt: string | null;
  detail?: string;
  status: SatelliteHealthStatus;
}

export interface Satellite {
  created_at: string;
  credential_ref: string | null;
  endpoints: SatelliteEndpoints;
  health: SatelliteHealth;
  id: string;
  name: string;
  pinned_version: string | null;
  slug: string;
  status: SatelliteStatus;
  tenant_id: string | null;
  updated_at: string;
}

export interface CreateSatelliteInput {
  credential_ref?: string | null;
  endpoints?: SatelliteEndpoints;
  name: string;
  pinned_version?: string | null;
  slug: string;
  tenant_id?: string | null;
}

export interface UpdateSatelliteInput {
  credential_ref?: string | null;
  endpoints?: SatelliteEndpoints;
  name?: string;
  pinned_version?: string | null;
  status?: SatelliteStatus;
}

export interface SatellitesDal {
  createSatellite: (input: CreateSatelliteInput) => Promise<Satellite>;
  deleteSatellite: (id: string) => Promise<void>;
  getSatellite: (id: string) => Promise<Satellite | null>;
  listSatellites: () => Promise<Satellite[]>;
  setSatelliteHealth: (id: string, health: SatelliteHealth) => Promise<void>;
  updateSatellite: (
    id: string,
    patch: UpdateSatelliteInput
  ) => Promise<Satellite>;
}

const DEFAULT_HEALTH: SatelliteHealth = { status: "unknown", checkedAt: null };

function rowToSatellite(row: Record<string, unknown>): Satellite {
  return {
    id: row.id as string,
    tenant_id: (row.tenant_id as string | null) ?? null,
    name: row.name as string,
    slug: row.slug as string,
    status: row.status as SatelliteStatus,
    endpoints: (row.endpoints as SatelliteEndpoints) ?? {},
    credential_ref: (row.credential_ref as string | null) ?? null,
    pinned_version: (row.pinned_version as string | null) ?? null,
    health: (row.health as SatelliteHealth) ?? DEFAULT_HEALTH,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function createSatellitesDal(
  config: Record<string, unknown>
): SatellitesDal {
  const { url, serviceRoleKey } = resolveSupabaseConfig(config);
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const table = () => client.schema("core").from("satellites");

  async function listSatellites(): Promise<Satellite[]> {
    const { data, error } = await table()
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      throw new Error(`Failed to load satellites: ${error.message}`);
    }
    return ((data ?? []) as Record<string, unknown>[]).map(rowToSatellite);
  }

  async function getSatellite(id: string): Promise<Satellite | null> {
    const { data, error } = await table()
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load satellite ${id}: ${error.message}`);
    }
    return data ? rowToSatellite(data as Record<string, unknown>) : null;
  }

  async function createSatellite(
    input: CreateSatelliteInput
  ): Promise<Satellite> {
    const { data, error } = await table()
      .insert({
        name: input.name,
        slug: input.slug,
        tenant_id: input.tenant_id ?? null,
        endpoints: input.endpoints ?? {},
        pinned_version: input.pinned_version ?? null,
        credential_ref: input.credential_ref ?? null,
      })
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to create satellite: ${error.message}`);
    }
    return rowToSatellite(data as Record<string, unknown>);
  }

  async function updateSatellite(
    id: string,
    patch: UpdateSatelliteInput
  ): Promise<Satellite> {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.name !== undefined) {
      update.name = patch.name;
    }
    if (patch.status !== undefined) {
      update.status = patch.status;
    }
    if (patch.endpoints !== undefined) {
      update.endpoints = patch.endpoints;
    }
    if (patch.pinned_version !== undefined) {
      update.pinned_version = patch.pinned_version;
    }
    if (patch.credential_ref !== undefined) {
      update.credential_ref = patch.credential_ref;
    }
    const { data, error } = await table()
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to update satellite ${id}: ${error.message}`);
    }
    return rowToSatellite(data as Record<string, unknown>);
  }

  async function setSatelliteHealth(
    id: string,
    health: SatelliteHealth
  ): Promise<void> {
    const { error } = await table()
      .update({ health, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      throw new Error(`Failed to set satellite health: ${error.message}`);
    }
  }

  async function deleteSatellite(id: string): Promise<void> {
    const { error } = await table().delete().eq("id", id);
    if (error) {
      throw new Error(`Failed to delete satellite ${id}: ${error.message}`);
    }
  }

  return {
    listSatellites,
    getSatellite,
    createSatellite,
    updateSatellite,
    setSatelliteHealth,
    deleteSatellite,
  };
}
