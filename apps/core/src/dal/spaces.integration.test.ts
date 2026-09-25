// Space invariants that live in SQL — seeding, triggers, constraints and the
// browser lane's row level security — proven against the real database.
//
// Skipped unless SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET
// are set (a local stack). Each run creates its own tenant and deletes it.
import { createHmac, randomUUID } from "node:crypto";
import { SPACE_BASELINE_MOUNTS, spaceMountKey } from "@engenty/plugin-sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET?.trim();
/** test/setup.ts pre-fills URL and key, so the env alone cannot tell whether a database is there. */
async function databaseAnswers(): Promise<boolean> {
  if (!(URL && KEY && JWT_SECRET)) {
    return false;
  }
  try {
    const res = await fetch(`${URL}/rest/v1/`, {
      headers: { apikey: KEY },
      signal: AbortSignal.timeout(1500),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}
const describeIfDb = (await databaseAnswers()) ? describe : describe.skip;

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** A browser-lane token: the `authenticated` role carrying the user and tenant. */
function userToken(userId: string, tenantId: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 600,
      role: "authenticated",
      sub: userId,
      tenant_id: tenantId,
    })
  );
  const signature = createHmac("sha256", JWT_SECRET ?? "")
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

describeIfDb("spaces against the database", () => {
  const admin = createClient(URL ?? "http://unset", KEY ?? "unset", {
    auth: { persistSession: false },
  });
  const core = () => admin.schema("core");
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const alice = randomUUID();
  const bob = randomUUID();
  // In the tenant but holding no role, so no personal space: owning a space is
  // then limited only by the constraint under test.
  const outsider = randomUUID();
  const otherTenantUser = randomUUID();
  let companyId = "";

  function asUser(userId: string): SupabaseClient {
    return createClient(URL ?? "http://unset", KEY ?? "unset", {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${userToken(userId, tenantId)}` },
      },
    });
  }

  async function createSpace(fields: Record<string, unknown>): Promise<string> {
    const { data, error } = await core()
      .from("spaces")
      .insert({ tenant_id: tenantId, ...fields })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data?.id as string;
  }

  async function personalSpaceOf(userId: string) {
    const { data } = await core()
      .from("spaces")
      .select("id, visibility, owner_user_id")
      .eq("tenant_id", tenantId)
      .eq("owner_user_id", userId)
      .maybeSingle();
    return data;
  }

  beforeAll(async () => {
    for (const id of [tenantId, otherTenantId]) {
      const { error } = await core()
        .from("tenants")
        .insert({
          id,
          name: "Spaces integration",
          slug: `spaces-it-${id.slice(0, 8)}`,
        });
      expect(error).toBeNull();
    }
    for (const [id, name] of [
      [alice, "alice"],
      [bob, "bob"],
    ] as const) {
      const user = await core()
        .from("users")
        .insert({
          email: `spaces-it-${name}-${tenantId.slice(0, 8)}@example.test`,
          id,
          tenant_id: tenantId,
        });
      expect(user.error).toBeNull();
      const role = await core()
        .from("user_tenant_roles")
        .insert({ role: "member", tenant_id: tenantId, user_id: id });
      expect(role.error).toBeNull();
    }
    for (const [id, tenant, name] of [
      [outsider, tenantId, "outsider"],
      [otherTenantUser, otherTenantId, "other"],
    ] as const) {
      const user = await core()
        .from("users")
        .insert({
          email: `spaces-it-${name}-${tenantId.slice(0, 8)}@example.test`,
          id,
          tenant_id: tenant,
        });
      expect(user.error).toBeNull();
    }
    const company = await core()
      .from("spaces")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_default", true)
      .single();
    companyId = company.data?.id as string;
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) {
      await core().from("tenants").delete().eq("id", id);
    }
  });

  describe("seeding", () => {
    it("gives every new space exactly the baseline mounts the setup dialog locks", async () => {
      const spaceId = await createSpace({ key: "seeded", name: "Seeded" });
      const { data } = await core()
        .from("space_mount")
        .select(
          "resource_type, resource_key, agent_access, record_scope, is_required"
        )
        .eq("space_id", spaceId);

      const byKey = new Map(
        (data ?? []).map((row) => [
          `${row.resource_type}:${row.resource_key}`,
          row,
        ])
      );
      expect([...byKey.keys()].sort()).toEqual(
        SPACE_BASELINE_MOUNTS.map(spaceMountKey).sort()
      );
      for (const declared of SPACE_BASELINE_MOUNTS) {
        const row = byKey.get(spaceMountKey(declared));
        expect(row?.agent_access ?? null, spaceMountKey(declared)).toBe(
          declared.agentAccess ?? null
        );
        expect(row?.record_scope ?? null).toBe(declared.recordScope ?? null);
        expect(row?.is_required).toBe(true);
      }
    });

    it("gives a new tenant a Company space with the chat and without tasks", async () => {
      const { data } = await core()
        .from("space_mount")
        .select("resource_type, resource_key")
        .eq("space_id", companyId);
      const keys = (data ?? []).map(
        (row) => `${row.resource_type}:${row.resource_key}`
      );

      expect(keys).toContain("module:engenty-copilot");
      expect(keys).toContain("agent:engenty.copilot");
      expect(keys).not.toContain("module:tasks");
    });
  });

  describe("personal spaces", () => {
    it("gives a person joining the tenant a private space of their own and a seat in Company", async () => {
      const personal = await personalSpaceOf(alice);
      expect(personal?.visibility).toBe("private");

      const { data: seats } = await core()
        .from("space_member")
        .select("space_id")
        .eq("user_id", alice);
      const seatIds = (seats ?? []).map((row) => row.space_id);
      expect(seatIds).toContain(companyId);
      expect(seatIds).not.toContain(personal?.id);
    });

    it("refuses a member on somebody's personal space", async () => {
      const personal = await personalSpaceOf(alice);
      const { error } = await core().from("space_member").insert({
        space_id: personal?.id,
        tenant_id: tenantId,
        user_id: bob,
      });
      expect(error).not.toBeNull();
    });

    it("keeps a leaving person's personal space, ownerless, and drops their seats", async () => {
      const leaver = randomUUID();
      await core()
        .from("users")
        .insert({
          email: `spaces-it-leaver-${tenantId.slice(0, 8)}@example.test`,
          id: leaver,
          tenant_id: tenantId,
        });
      await core()
        .from("user_tenant_roles")
        .insert({ role: "member", tenant_id: tenantId, user_id: leaver });
      const personal = await personalSpaceOf(leaver);

      await core()
        .from("user_tenant_roles")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", leaver);

      const { data: kept } = await core()
        .from("spaces")
        .select("owner_user_id")
        .eq("id", personal?.id as string)
        .single();
      expect(kept?.owner_user_id).toBeNull();
      const { data: seats } = await core()
        .from("space_member")
        .select("space_id")
        .eq("user_id", leaver);
      expect(seats).toEqual([]);
    });
  });

  describe("constraints", () => {
    it("opens a space to the tenant unless it is made private", async () => {
      const spaceId = await createSpace({
        key: "defaulted",
        name: "Defaulted",
      });
      const { data } = await core()
        .from("spaces")
        .select("visibility")
        .eq("id", spaceId)
        .single();
      expect(data?.visibility).toBe("open");
    });

    it("refuses an owned space that is not private, and an owned default space", async () => {
      const ownedOpen = await core().from("spaces").insert({
        key: "owned-open",
        name: "x",
        owner_user_id: outsider,
        tenant_id: tenantId,
        visibility: "open",
      });
      expect(ownedOpen.error).not.toBeNull();

      const ownedDefault = await core()
        .from("spaces")
        .update({ owner_user_id: outsider, visibility: "private" })
        .eq("id", companyId);
      expect(ownedDefault.error).not.toBeNull();
    });

    it("refuses a deletion mark without a purge date", async () => {
      const spaceId = await createSpace({ key: "half-marked", name: "x" });
      const { error } = await core()
        .from("spaces")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", spaceId);
      expect(error).not.toBeNull();
    });

    it("refuses a seat that pairs a space with another tenant", async () => {
      // The other tenant's own user, so only the space side of the pairing is wrong.
      const { error } = await core().from("space_member").insert({
        space_id: companyId,
        tenant_id: otherTenantId,
        user_id: otherTenantUser,
      });
      expect(error).not.toBeNull();
    });
  });

  describe("browser lane", () => {
    it("shows a person open spaces, their own personal space and private spaces they sit in — nothing else", async () => {
      const open = await createSpace({ key: "rls-open", name: "Open" });
      const invited = await createSpace({
        key: "rls-invited",
        name: "Invited",
        visibility: "private",
      });
      const closed = await createSpace({
        key: "rls-closed",
        name: "Closed",
        visibility: "private",
      });
      const marked = await createSpace({ key: "rls-marked", name: "Marked" });
      await core().from("space_member").insert({
        role: "member",
        space_id: invited,
        tenant_id: tenantId,
        user_id: alice,
      });
      await core()
        .from("spaces")
        .update({
          deleted_at: new Date().toISOString(),
          purge_after: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .eq("id", marked);
      const own = (await personalSpaceOf(alice))?.id;
      const bobs = (await personalSpaceOf(bob))?.id;

      const { data, error } = await asUser(alice)
        .schema("core")
        .from("spaces")
        .select("id")
        .eq("tenant_id", tenantId);
      expect(error).toBeNull();
      const visible = (data ?? []).map((row) => row.id);

      expect(visible).toEqual(
        expect.arrayContaining([companyId, open, invited, own])
      );
      expect(visible).not.toContain(closed);
      expect(visible).not.toContain(bobs);
      expect(visible).not.toContain(marked);
    });

    it("shows mounts only of spaces the person can see", async () => {
      const closed = await createSpace({
        key: "rls-closed-mounts",
        name: "x",
        visibility: "private",
      });

      const { data } = await asUser(alice)
        .schema("core")
        .from("space_mount")
        .select("space_id")
        .in("space_id", [closed, companyId]);
      const spaceIds = new Set((data ?? []).map((row) => row.space_id));

      expect(spaceIds.has(companyId)).toBe(true);
      expect(spaceIds.has(closed)).toBe(false);
    });

    it("shows a person only their own seats", async () => {
      const { data } = await asUser(alice)
        .schema("core")
        .from("space_member")
        .select("user_id")
        .eq("space_id", companyId);

      expect(new Set((data ?? []).map((row) => row.user_id))).toEqual(
        new Set([alice])
      );
    });
  });

  describe("purge", () => {
    it("refuses to purge a live space or the Company space", async () => {
      const live = await createSpace({ key: "purge-live", name: "x" });
      for (const spaceId of [live, companyId]) {
        const { error } = await core().rpc("purge_space", {
          p_space_id: spaceId,
          p_tenant_id: tenantId,
        });
        expect(error?.message).toContain("space_purge_refused");
      }
    });

    it("is not callable from the browser lane", async () => {
      const { error } = await asUser(alice).schema("core").rpc("purge_space", {
        p_space_id: companyId,
        p_tenant_id: tenantId,
      });
      expect(error).not.toBeNull();
      expect(error?.message).not.toContain("space_purge_refused");
    });
  });
});
