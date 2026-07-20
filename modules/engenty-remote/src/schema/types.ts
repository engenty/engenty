// module_remote row shapes (see supabase/migrations).

export const REMOTE_PLATFORMS = [
  "slack",
  "telegram",
  "whatsapp",
  "teams",
] as const;

export type RemotePlatform = (typeof REMOTE_PLATFORMS)[number];

export type RemoteBindingStatus = "active" | "disabled";

export type RemoteUnmappedSenderPolicy = "ignore" | "invite" | "deny";

export interface RemoteBindingRow {
  agent_id: string;
  capability_ceiling: Record<string, unknown>;
  connection_id: string | null;
  created_at: string;
  display_name: string | null;
  external_workspace_id: string | null;
  id: string;
  platform: RemotePlatform;
  settings: Record<string, unknown>;
  status: RemoteBindingStatus;
  tenant_id: string;
  unmapped_sender_policy: RemoteUnmappedSenderPolicy;
  updated_at: string;
}

export interface RemoteIdentityRow {
  created_at: string;
  display_name: string | null;
  external_user_id: string;
  id: string;
  platform: RemotePlatform;
  tenant_id: string;
  user_id: string;
  verified_at: string | null;
}

export interface RemoteConversationRow {
  ai_thread_id: string | null;
  binding_id: string;
  created_at: string;
  external_thread_id: string;
  id: string;
  is_dm: boolean;
  last_event_at: string;
  tenant_id: string;
}

export interface RemotePairingRequestRow {
  binding_id: string;
  claimed_at: string | null;
  claimed_by: string | null;
  code: string;
  created_at: string;
  display_name: string | null;
  expires_at: string;
  external_user_id: string;
  id: string;
  platform: RemotePlatform;
  tenant_id: string;
}
