export type ArtifactScopeType = "thread" | "task" | "project" | "goal";
export type ArtifactCreatorKind = "agent" | "user";
export type ArtifactStorageKind = "inline" | "blob";
export type ArtifactStatus = "active" | "archived";

/** Row shape of ai.artifact (snake_case, 1:1 with the table). */
export interface ArtifactRow {
  created_at: string;
  created_by: string | null;
  created_by_kind: ArtifactCreatorKind;
  current_version: number;
  id: string;
  metadata: Record<string, unknown>;
  mime_type: string | null;
  scope_id: string;
  scope_type: ArtifactScopeType;
  size_bytes: number | null;
  status: ArtifactStatus;
  storage: ArtifactStorageKind;
  storage_connection_id: string | null;
  storage_key: string | null;
  tenant_id: string;
  thread_id: string | null;
  title: string;
  type: string;
  updated_at: string;
}

/** Row shape of ai.artifact_version (snake_case, 1:1 with the table). */
export interface ArtifactVersionRow {
  artifact_id: string;
  content: string | null;
  created_at: string;
  created_by: string | null;
  created_by_kind: ArtifactCreatorKind;
  id: string;
  storage_key: string | null;
  summary: string | null;
  tenant_id: string;
  version: number;
}
