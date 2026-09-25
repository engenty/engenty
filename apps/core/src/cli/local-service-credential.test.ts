import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  ServiceCredentialRecord,
  ServiceCredentialStore,
} from "../security/auth-stores/types.js";
import {
  ensureLocalServiceCredential,
  isLocalSupabaseUrl,
  LOCAL_AI_SERVICE_CAPABILITIES,
  LOCAL_AI_SERVICE_CREDENTIAL_NAME,
  parseServiceSecret,
} from "./local-service-credential.js";

function memoryStore(rows: ServiceCredentialRecord[] = []) {
  const store: Pick<ServiceCredentialStore, "get" | "insert"> = {
    async get(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async insert(record) {
      rows.push(record);
    },
  };
  return { rows, store };
}

const sha256 = (raw: string) => createHash("sha256").update(raw).digest("hex");

describe("ensureLocalServiceCredential", () => {
  it("keeps a configured secret whose row is live and whose hash matches", async () => {
    const { rows, store } = memoryStore([
      {
        capabilities: [...LOCAL_AI_SERVICE_CAPABILITIES],
        createdAt: 1,
        id: "cred-1",
        name: "ai-service",
        secretHash: sha256("engsvc_abc"),
        tenantId: null,
      },
    ]);
    const result = await ensureLocalServiceCredential({
      configured: "cred-1.engsvc_abc",
      stores: store,
    });
    expect(result).toEqual({ credentialId: "cred-1", status: "kept" });
    expect(rows).toHaveLength(1);
  });

  it("replaces a live row minted before the AI service set grew", async () => {
    // A row with only module.read/write would 403 every routine calling a
    // connector action (module.connections.read is not covered).
    const { rows, store } = memoryStore([
      {
        capabilities: ["module.read", "module.write", "module.execute"],
        createdAt: 1,
        id: "cred-1",
        name: "ai-service (local) old",
        secretHash: sha256("engsvc_abc"),
        tenantId: null,
      },
    ]);
    const result = await ensureLocalServiceCredential({
      configured: "cred-1.engsvc_abc",
      stores: store,
    });
    expect(result.status).toBe("minted");
    if (result.status !== "minted") {
      return;
    }
    expect(result.reason).toBe("stale_capabilities");
    expect(rows.at(-1)?.capabilities).toEqual([
      ...LOCAL_AI_SERVICE_CAPABILITIES,
    ]);
  });

  it("mints a platform credential when nothing is configured", async () => {
    const { rows, store } = memoryStore();
    const result = await ensureLocalServiceCredential({
      configured: undefined,
      stores: store,
    });
    expect(result.status).toBe("minted");
    if (result.status !== "minted") {
      return;
    }
    const row = rows[0]!;
    expect(row.tenantId).toBeNull();
    // The returned value is what apps/ai exchanges; the stored hash covers the
    // part after the id, as the API route stores it.
    const parsed = parseServiceSecret(result.secret);
    expect(parsed?.credentialId).toBe(row.id);
    expect(sha256(parsed?.secret ?? "")).toBe(row.secretHash);
  });

  it("re-mints when the configured row is gone, revoked, or the secret is wrong — never touching the old row", async () => {
    const stale: ServiceCredentialRecord = {
      capabilities: [],
      createdAt: 1,
      disabledAt: 2,
      id: "old",
      name: "ai-service",
      secretHash: sha256("engsvc_old"),
      tenantId: "tenant-1",
    };
    const gone = await ensureLocalServiceCredential({
      configured: "nope.engsvc_x",
      stores: memoryStore().store,
    });
    expect(gone.status === "minted" && gone.reason).toBe("unknown");

    const { rows, store } = memoryStore([stale]);
    const revoked = await ensureLocalServiceCredential({
      configured: "old.engsvc_old",
      stores: store,
    });
    expect(revoked.status === "minted" && revoked.reason).toBe("disabled");
    expect(rows[0]).toEqual(stale);
    expect(rows).toHaveLength(2);

    const live = memoryStore([{ ...stale, disabledAt: undefined }]);
    const wrong = await ensureLocalServiceCredential({
      configured: "old.engsvc_other",
      stores: live.store,
    });
    expect(wrong.status === "minted" && wrong.reason).toBe("wrong_secret");
  });
});

describe("ensureLocalServiceCredential — one active platform name", () => {
  it("mints under another name when a live row already holds the base name, and never revokes it", async () => {
    const rows: ServiceCredentialRecord[] = [
      {
        capabilities: [],
        createdAt: 1,
        id: "other-checkouts",
        name: LOCAL_AI_SERVICE_CREDENTIAL_NAME,
        secretHash: sha256("engsvc_theirs"),
        tenantId: null,
      },
    ];
    const store: Pick<ServiceCredentialStore, "get" | "insert"> = {
      async get(id) {
        return rows.find((row) => row.id === id) ?? null;
      },
      async insert(record) {
        if (
          rows.some(
            (row) =>
              row.tenantId === null &&
              row.disabledAt === undefined &&
              row.name === record.name
          )
        ) {
          throw new Error(
            'service_credential insert: duplicate key value violates unique constraint "service_credential_active_platform_name"'
          );
        }
        rows.push(record);
      },
    };
    const result = await ensureLocalServiceCredential({
      configured: undefined,
      stores: store,
    });
    expect(result.status).toBe("minted");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.disabledAt).toBeUndefined();
    expect(rows[1]?.name).not.toBe(LOCAL_AI_SERVICE_CREDENTIAL_NAME);
  });
});

describe("isLocalSupabaseUrl", () => {
  it("accepts loopback and .localhost only", () => {
    expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("https://db.engenty.localhost")).toBe(true);
    expect(isLocalSupabaseUrl("https://abc.supabase.co")).toBe(false);
    expect(isLocalSupabaseUrl(undefined)).toBe(false);
    expect(isLocalSupabaseUrl("not a url")).toBe(false);
  });
});
