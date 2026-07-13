import { request } from "./http";

export type SatelliteStatus =
  | "provisioning"
  | "active"
  | "suspended"
  | "error"
  | "archived";

export type SatelliteHealthStatus = "unknown" | "healthy" | "degraded" | "down";

export interface SatelliteEndpoints {
  apiUrl?: string;
  gotrueUrl?: string;
  postgresMetaUrl?: string;
  storageUrl?: string;
  studioUrl?: string;
}

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

export function listSatellites(signal?: AbortSignal) {
  return request<{ satellites: Satellite[] }>("/api/superadmin/satellites", {
    signal,
  }).then((r) => r.satellites);
}

export function createSatellite(input: {
  name: string;
  slug?: string;
  endpoints?: SatelliteEndpoints;
  pinned_version?: string | null;
}) {
  return request<Satellite>("/api/superadmin/satellites", {
    method: "POST",
    body: input,
  });
}

export function probeSatelliteHealth(id: string) {
  return request<{ health: SatelliteHealth }>(
    `/api/superadmin/satellites/${encodeURIComponent(id)}/health`,
    { method: "POST" }
  );
}

export function deleteSatellite(id: string) {
  return request<{ deleted: boolean }>(
    `/api/superadmin/satellites/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}
