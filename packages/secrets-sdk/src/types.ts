export type OwnerScope = "user" | "project" | "client" | "tenant";
export type SecretKind =
  | "username_password"
  | "api_key"
  | "key_list"
  | "credit_card"
  | "note";

/** Row shape returned to the client — NEVER includes payload_enc. */
export interface SecretMetadata {
  created_at: string;
  created_by: string | null;
  description: string | null;
  id: string;
  kind: SecretKind;
  name: string;
  owner_id: string;
  owner_scope: OwnerScope;
  scope_id: string;
  tenant_id: string;
  updated_at: string;
  url: string | null;
}

/** Decrypted payloads by kind (only crosses the wire on an audited reveal). */
export type SecretPayload =
  | { kind: "username_password"; username: string; password: string }
  | { kind: "api_key"; keyType?: string; value: string }
  | { kind: "key_list"; keys: Array<{ label: string; value: string }> }
  | { kind: "credit_card"; number: string; expiryDate: string; cvv: string }
  | { kind: "note"; content: string };
