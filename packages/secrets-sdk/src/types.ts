export type OwnerScope = "user" | "project" | "client" | "tenant";
export type SecretKind =
  | "username_password"
  | "api_key"
  | "key_list"
  | "credit_card"
  | "note";

/** Row shape returned to the client — NEVER includes payload_enc. */
export interface SecretMetadata {
  id: string;
  tenant_id: string;
  scope_id: string;
  owner_scope: OwnerScope;
  owner_id: string;
  name: string;
  kind: SecretKind;
  url: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Decrypted payloads by kind (only crosses the wire on an audited reveal). */
export type SecretPayload =
  | { kind: "username_password"; username: string; password: string }
  | { kind: "api_key"; keyType?: string; value: string }
  | { kind: "key_list"; keys: Array<{ label: string; value: string }> }
  | { kind: "credit_card"; number: string; expiryDate: string; cvv: string }
  | { kind: "note"; content: string };
