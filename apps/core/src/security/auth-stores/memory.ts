import type {
  ApiTokenRecord,
  AuthStores,
  DeviceAuthorizationRecord,
  SessionRecord,
} from "./types.js";

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** In-memory stores: tests and fallback when Supabase is not configured. */
export function createMemoryAuthStores(): AuthStores {
  const devices = new Map<string, DeviceAuthorizationRecord>();
  const sessions = new Map<string, SessionRecord>();
  const apiTokens = new Map<string, ApiTokenRecord>();

  return {
    apiTokens: {
      get(id) {
        return Promise.resolve(apiTokens.get(id) ?? null);
      },
      insert(record) {
        apiTokens.set(record.id, { ...record });
        return Promise.resolve();
      },
      listForPrincipal(tenantId, principalId) {
        return Promise.resolve(
          [...apiTokens.values()].filter(
            (token) =>
              token.tenantId === tenantId && token.principalId === principalId
          )
        );
      },
      listRevokedIds() {
        return Promise.resolve(
          [...apiTokens.values()]
            .filter(
              (token) => token.revokedAt && token.expiresAt > nowEpochSeconds()
            )
            .map((token) => ({ expiresAt: token.expiresAt, id: token.id }))
        );
      },
      revoke(id) {
        const existing = apiTokens.get(id);
        if (existing) {
          apiTokens.set(id, { ...existing, revokedAt: nowEpochSeconds() });
        }
        return Promise.resolve();
      },
    },
    devices: {
      getByCodeHash(deviceCodeHash) {
        return Promise.resolve(devices.get(deviceCodeHash) ?? null);
      },
      getPendingByUserCode(userCode) {
        for (const record of devices.values()) {
          if (
            record.userCode === userCode &&
            record.status === "pending" &&
            record.expiresAt > nowEpochSeconds()
          ) {
            return Promise.resolve(record);
          }
        }
        return Promise.resolve(null);
      },
      insert(record) {
        devices.set(record.deviceCodeHash, { ...record });
        return Promise.resolve();
      },
      update(deviceCodeHash, patch) {
        const existing = devices.get(deviceCodeHash);
        if (existing) {
          devices.set(deviceCodeHash, { ...existing, ...patch });
        }
        return Promise.resolve();
      },
    },
    sessions: {
      get(sessionId) {
        return Promise.resolve(sessions.get(sessionId) ?? null);
      },
      insert(record) {
        sessions.set(record.id, { ...record });
        return Promise.resolve();
      },
      listForPrincipal(tenantId, principalId) {
        return Promise.resolve(
          [...sessions.values()].filter(
            (session) =>
              session.tenantId === tenantId &&
              session.principalId === principalId
          )
        );
      },
      update(sessionId, patch) {
        const existing = sessions.get(sessionId);
        if (existing) {
          sessions.set(sessionId, { ...existing, ...patch });
        }
        return Promise.resolve();
      },
    },
  };
}
