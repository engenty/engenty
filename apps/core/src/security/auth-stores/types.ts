/** Persistent stores backing auth flows (device login, sessions, API tokens). */

export type DeviceAuthorizationStatus =
  | "pending"
  | "approved"
  | "denied"
  | "consumed"
  | "expired";

export interface DeviceGrantScopes {
  capabilities: string[];
  moduleIds: string[];
  scopes: string[];
}

export interface DeviceAuthorizationRecord {
  approvedAt?: number;
  /** Auth user id of the approver (becomes the token principal). */
  approvedBy?: string;
  approvedTenantId?: string;
  clientName?: string;
  createdAt: number;
  /** sha256 of the device code — the raw code is never stored. */
  deviceCodeHash: string;
  expiresAt: number;
  /** Clamped scopes fixed at approval time. */
  granted?: DeviceGrantScopes;
  lastPolledAt?: number;
  requested: DeviceGrantScopes;
  status: DeviceAuthorizationStatus;
  userCode: string;
}

export interface SessionRecord {
  createdAt: number;
  expiresAt: number;
  id: string;
  principalId: string;
  refreshTokenHash: string;
  refreshTokenId: string;
  revokedAt?: number;
  tenantId: string;
}

export interface DeviceAuthorizationStore {
  getByCodeHash(
    deviceCodeHash: string
  ): Promise<DeviceAuthorizationRecord | null>;
  /** Only returns a PENDING, unexpired record for the code. */
  getPendingByUserCode(
    userCode: string
  ): Promise<DeviceAuthorizationRecord | null>;
  insert(record: DeviceAuthorizationRecord): Promise<void>;
  update(
    deviceCodeHash: string,
    patch: Partial<DeviceAuthorizationRecord>
  ): Promise<void>;
}

export interface SessionStore {
  get(sessionId: string): Promise<SessionRecord | null>;
  insert(record: SessionRecord): Promise<void>;
  listForPrincipal(
    tenantId: string,
    principalId: string
  ): Promise<SessionRecord[]>;
  update(sessionId: string, patch: Partial<SessionRecord>): Promise<void>;
}

export interface ApiTokenRecord {
  capabilities: string[];
  createdAt: number;
  expiresAt: number;
  id: string;
  last4: string;
  moduleIds: string[];
  name: string;
  principalId: string;
  principalType: "agent" | "service";
  revokedAt?: number;
  scopes: string[];
  tenantId: string;
  /** sha256 of the issued JWT (verification stays stateless; hash backs audit). */
  tokenHash: string;
}

export interface ApiTokenStore {
  get(id: string): Promise<ApiTokenRecord | null>;
  insert(record: ApiTokenRecord): Promise<void>;
  listForPrincipal(
    tenantId: string,
    principalId: string
  ): Promise<ApiTokenRecord[]>;
  /** Ids of revoked, not-yet-expired tokens (preloaded into the revocation set at boot). */
  listRevokedIds(): Promise<Array<{ expiresAt: number; id: string }>>;
  revoke(id: string): Promise<void>;
}

/**
 * A durable secret that can only be exchanged for a short-lived access token.
 * Unlike `ApiTokenRecord` there is no issued JWT here — the credential is not
 * itself a bearer, which is what lets it live in an env var safely.
 */
export interface ServiceCredentialRecord {
  capabilities: string[];
  createdAt: number;
  disabledAt?: number;
  id: string;
  lastUsedAt?: number;
  name: string;
  /** sha256 of the raw secret — the raw value is shown once at creation. */
  secretHash: string;
  tenantId: string;
}

export interface ServiceCredentialStore {
  get(id: string): Promise<ServiceCredentialRecord | null>;
  insert(record: ServiceCredentialRecord): Promise<void>;
  listForTenant(tenantId: string): Promise<ServiceCredentialRecord[]>;
  /** Revoke = set `disabledAt`; the access-token TTL is the revocation lag. */
  revoke(id: string): Promise<void>;
  touch(id: string, atEpochSeconds: number): Promise<void>;
}

export interface AuthStores {
  apiTokens: ApiTokenStore;
  devices: DeviceAuthorizationStore;
  serviceCredentials: ServiceCredentialStore;
  sessions: SessionStore;
}
