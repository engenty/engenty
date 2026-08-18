import { describe, expect, it } from "vitest";
import {
  createNoopAuditLog,
  createPersistentAuditLog,
  type PersistentAuditStore,
} from "./audit-adapter.js";
import { createAuditStoreSupabase } from "./audit-supabase.js";
import type {
  AuditEventRow,
  AuditFilterDistincts,
  ListOptions,
  PushEventInput,
} from "./audit-types.js";

/** Skip live PostgREST tests in CI — setup.ts always injects demokey JWTs. */
const hasLiveSupabase =
  process.env.CI !== "true" &&
  process.env.ENGENTY_LIVE_SUPABASE === "1" &&
  Boolean(process.env.SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const PUSH_SETTLE_MS = 200;

function config() {
  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

function createMemoryAuditStore(): PersistentAuditStore {
  const rows: AuditEventRow[] = [];
  return {
    async push(event: PushEventInput) {
      rows.unshift({
        id: `mem-${rows.length + 1}`,
        timestamp: new Date().toISOString(),
        type: event.type,
        actor_id: event.actorId ?? null,
        tenant_id: event.tenantId ?? null,
        module_id: event.moduleId ?? null,
        operation_id: event.operationId ?? null,
        detail: JSON.stringify(event.detail ?? {}),
        source_kind: event.source_kind ?? "core",
        source_module_id: event.source_module_id ?? null,
        source_component: event.source_component ?? null,
      });
    },
    async list(limit = 200, options?: ListOptions) {
      return rows
        .filter((row) => {
          if (options?.types && !options.types.includes(row.type)) {
            return false;
          }
          return true;
        })
        .slice(0, limit);
    },
    async count() {
      return rows.length;
    },
    async distincts(): Promise<AuditFilterDistincts> {
      return {
        types: [...new Set(rows.map((row) => row.type))],
        module_ids: [
          ...new Set(
            rows
              .map((row) => row.module_id)
              .filter((id): id is string => Boolean(id))
          ),
        ],
      };
    },
  };
}

describe("audit-adapter", () => {
  describe("createNoopAuditLog", () => {
    it("returns empty list, count 0, and empty distincts", async () => {
      const adapter = createNoopAuditLog();
      adapter.push({ type: "test", source_kind: "core" });
      const list = await adapter.list(10);
      const total = await adapter.count();
      const d = await adapter.distincts();
      expect(list).toHaveLength(0);
      expect(total).toBe(0);
      expect(d.types).toEqual([]);
      expect(d.module_ids).toEqual([]);
    });
  });

  describe("createPersistentAuditLog (memory)", () => {
    it("push records event via fire-and-forget", async () => {
      const adapter = createPersistentAuditLog({
        dataDir: "/tmp",
        store: createMemoryAuditStore(),
      });
      adapter.push({
        type: "auth.login_started",
        actorId: "u1",
        tenantId: "t1",
      });

      await new Promise((r) => setTimeout(r, PUSH_SETTLE_MS));
      const list = await adapter.list(10);
      expect(list.length).toBeGreaterThanOrEqual(1);
      const recent = list.find((e) => e.type === "auth.login_started");
      expect(recent).toBeDefined();
    });

    it("list returns events with filters", async () => {
      const store = createMemoryAuditStore();
      await store.push({ type: "auth.login_started", source_kind: "core" });
      await store.push({ type: "auth.rate_limited", source_kind: "core" });

      const adapter = createPersistentAuditLog({
        dataDir: "/tmp",
        store,
      });
      const filtered = await adapter.list(10, {
        types: ["auth.login_started"],
      });
      expect(filtered.every((e) => e.type === "auth.login_started")).toBe(true);
    });

    it("count returns total", async () => {
      const store = createMemoryAuditStore();
      await store.push({ type: "auth.login_started", source_kind: "core" });
      await store.push({ type: "auth.rate_limited", source_kind: "core" });

      const adapter = createPersistentAuditLog({
        dataDir: "/tmp",
        store,
      });
      const total = await adapter.count();
      expect(total).toBeGreaterThanOrEqual(2);
    });

    it("distincts returns unique types and module_ids", async () => {
      const adapter = createPersistentAuditLog({
        dataDir: "/tmp",
        store: createMemoryAuditStore(),
      });
      adapter.push({
        type: "operation.executed",
        moduleId: "invoices",
        source_kind: "module",
        source_module_id: "invoices",
      });
      await new Promise((r) => setTimeout(r, PUSH_SETTLE_MS));

      const d = await adapter.distincts();
      expect(d.types).toContain("operation.executed");
      expect(d.module_ids).toContain("invoices");
    });
  });

  describe.skipIf(!hasLiveSupabase)(
    "createPersistentAuditLog (Supabase)",
    () => {
      it("push records event via fire-and-forget", async () => {
        const adapter = createPersistentAuditLog({
          dataDir: "/tmp",
          config: config(),
        });
        adapter.push({
          type: "auth.login_started",
          actorId: "u1",
          tenantId: "t1",
        });

        await new Promise((r) => setTimeout(r, PUSH_SETTLE_MS));
        const list = await adapter.list(10);
        expect(list.length).toBeGreaterThanOrEqual(1);
        const recent = list.find((e) => e.type === "auth.login_started");
        expect(recent).toBeDefined();
      });

      it("list returns events with filters", async () => {
        const store = createAuditStoreSupabase(config(), {});
        await store.push({ type: "auth.login_started", source_kind: "core" });
        await store.push({ type: "auth.rate_limited", source_kind: "core" });

        const adapter = createPersistentAuditLog({
          dataDir: "/tmp",
          config: config(),
        });
        const filtered = await adapter.list(10, {
          types: ["auth.login_started"],
        });
        expect(filtered.every((e) => e.type === "auth.login_started")).toBe(
          true
        );
      });
    }
  );
});
