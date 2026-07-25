/** Domain types for engenty Apps. Mirrors src/schema/zod.ts. */

export type AppStatus = "active" | "archived" | "draft";
export type AppVersionStatus = "active" | "archived" | "proposed";
export type ActorKind = "agent" | "user";
export type AppActionRisk = "high" | "low";

export interface AppManifestAction {
  /** Path inside the app backend, without the leading slash. */
  id: string;
  requiresApproval?: boolean;
  risk: AppActionRisk;
  summary: string;
}

export interface AppManifest {
  actions: AppManifestAction[];
  /** Hosts the backend may reach. Empty = deny-all, which is the default. */
  egress: { connect: string[] };
  /** Operation ids this App may invoke on the caller's behalf. */
  engenty: { operations: string[] };
  entry: { backend?: string; frontend: string };
  name: string;
  /** Path to the pure rules module, if the App has one. See §7 of the plan. */
  rules?: string;
  storage: { config: boolean; data: boolean };
}

export interface App {
  active_version_id: string | null;
  created_at: string;
  created_by: string | null;
  created_by_kind: ActorKind;
  description: string | null;
  id: string;
  name: string;
  scope_id: string;
  slug: string;
  status: AppStatus;
  tenant_id: string;
  updated_at: string;
}

export interface AppVersion {
  app_id: string;
  build_log: string | null;
  created_at: string;
  created_by: string | null;
  created_by_kind: ActorKind;
  deployed_at: string | null;
  files: Record<string, string>;
  id: string;
  manifest: AppManifest;
  release: string | null;
  scope_id: string;
  status: AppVersionStatus;
  tenant_id: string;
  version: number;
}

export interface AppCapability {
  allowed_operations: string[];
  app_id: string;
  created_at: string;
  expires_at: string;
  id: string;
  revoked_at: string | null;
  tenant_id: string;
  user_id: string;
}

export interface AppConsent {
  app_id: string;
  app_version: number;
  granted_at: string;
  id: string;
  operations: string[];
  tenant_id: string;
  user_id: string;
}

export interface AppDataEntry {
  app_id: string;
  created_at: string;
  key: string;
  scope_id: string;
  session_id: string;
  tenant_id: string;
  updated_at: string;
  value: unknown;
}

export interface AppConfigEntry {
  app_id: string;
  created_at: string;
  key: string;
  scope_id: string;
  tenant_id: string;
  updated_at: string;
  /** Null is the tenant-wide default; a uuid is that user's own value. */
  user_id: string | null;
  value: unknown;
}

export interface AppCreateInput {
  created_by_agent_type_key?: string;
  description?: string | null;
  name: string;
  slug: string;
}

export interface AppFileWriteInput {
  app_id: string;
  files: Record<string, string>;
  manifest?: AppManifest;
}
