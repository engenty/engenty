// The persistent audit log against the real database: a pushed event lands in
// core.audit_events and reads back through the adapter.
//
// Skipped unless SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set and the stack
// answers (test/setup.ts always fills in local defaults). Each run writes a
// uniquely typed event and deletes it afterwards.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createPersistentAuditLog } from "./audit-adapter.js";

const URL = process.env.SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

async function stackAnswers(): Promise<boolean> {
  if (!(URL && KEY)) {
    return false;
  }
  try {
    const res = await fetch(`${URL}/rest/v1/`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const describeIfDb = (await stackAnswers()) ? describe : describe.skip;

describeIfDb("persistent audit log against the database", () => {
  const client = createClient(URL ?? "http://unset", KEY ?? "unset", {
    auth: { persistSession: false },
  });
  const type = `test.audit_it_${randomUUID().replaceAll("-", "")}`;

  afterAll(async () => {
    await client.schema("core").from("audit_events").delete().eq("type", type);
  });

  it("persists a pushed event so it can be listed by type", async () => {
    const log = createPersistentAuditLog({
      config: { supabaseServiceRoleKey: KEY, supabaseUrl: URL },
      dataDir: "/tmp",
    });

    log.push({ actorId: "audit-it", type });

    await vi.waitFor(
      async () => {
        const rows = await log.list(10, { types: [type] });
        expect(rows).toEqual([
          expect.objectContaining({ actor_id: "audit-it", type }),
        ]);
      },
      { timeout: 5000 }
    );
  });
});
