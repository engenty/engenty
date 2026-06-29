import { describe, expect, it } from "vitest";
import {
  createNoopAuditLog,
  createPersistentAuditLog,
} from "./audit-adapter.js";
import { createAuditStoreSupabase } from "./audit-supabase.js";

/** Skip Supabase tests when URL/key missing or key is not a valid JWT (3 parts). */
const hasSupabase =
  !!process.env.SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY.split(".").length === 3;

/** Allow fire-and-forget push to persist. */
const PUSH_SETTLE_MS = 200;

function config() {
  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  describe.skipIf(!hasSupabase)("createPersistentAuditLog (Supabase)", () => {
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
      expect(filtered.every((e) => e.type === "auth.login_started")).toBe(true);
    });

    it("count returns total", async () => {
      const store = createAuditStoreSupabase(config(), {});
      await store.push({ type: "auth.login_started", source_kind: "core" });
      await store.push({ type: "auth.rate_limited", source_kind: "core" });

      const adapter = createPersistentAuditLog({
        dataDir: "/tmp",
        config: config(),
      });
      const total = await adapter.count();
      expect(total).toBeGreaterThanOrEqual(2);
    });

    it("distincts returns unique types and module_ids", async () => {
      const adapter = createPersistentAuditLog({
        dataDir: "/tmp",
        config: config(),
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
});
