/** Domain types for engenty Apps. Mirrors src/schema/zod.ts. */

export type AppStatus = "active" | "archived" | "draft";
/**
 * A version is one release attempt of one commit: `failed` never built,
 * `proposed` built and awaits a decision, `active` is live, `archived` was
 * rejected or superseded.
 */
export type AppVersionStatus = "active" | "archived" | "failed" | "proposed";
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
  /**
   * Operation ids this App may invoke on the caller's behalf, and the Space
   * tables (by id) it may read and write through the bridge.
   */
  engenty: { operations: string[]; tables: string[] };
  entry: { backend?: string; frontend: string };
  name: string;
  /** Path to the pure rules module, if the App has one. */
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
  /** The space the App was created in; null for an App created outside one. */
  space_id: string | null;
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
  /** The built frontend document; what the artifact frame renders. */
  frontend_html: string | null;
  id: string;
  manifest: AppManifest;
  /** agentOS release id, once the backend deployed. */
  release: string | null;
  scope_id: string;
  /** The commit this version was released from. */
  sha: string;
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
  delete?: string[];
  files?: Record<string, string>;
  manifest?: AppManifest;
  message?: string;
}
