// The thread store against the real database. Which Space's or person's threads
// a query returns is decided in SQL, so it is proven here, not on a query fake.
//
// Skipped unless SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (a local
// stack). Each run creates its own tenant and deletes it afterwards.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createThreadStore } from "./thread-store.js";

const URL = process.env.SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const describeIfDb = URL && KEY ? describe : describe.skip;

describeIfDb("thread store against the database", () => {
  const client = createClient(URL ?? "http://unset", KEY ?? "unset", {
    auth: { persistSession: false },
  });
  const tenantId = randomUUID();
  const me = randomUUID();
  const colleague = randomUUID();
  let spaceA = "";
  let spaceB = "";
  const store = createThreadStore(client as never);
  const ai = () => client.schema("ai");

  async function thread(input: {
    agentId?: string;
    owner?: string;
    routeContext?: Record<string, unknown>;
    spaceId: string | null;
  }): Promise<string> {
    const id = randomUUID();
    const { error } = await ai()
      .from("thread")
      .insert({
        agent_id: input.agentId ?? "engenty.copilot",
        created_by_user_id: input.owner ?? me,
        id,
        route_context: input.routeContext ?? {},
        space_id: input.spaceId,
        tenant_id: tenantId,
      });
    expect(error).toBeNull();
    return id;
  }

  async function participate(threadId: string, userId = me) {
    const { error } = await ai().from("thread_participant").insert({
      principal_id: userId,
      principal_type: "user",
      tenant_id: tenantId,
      thread_id: threadId,
    });
    expect(error).toBeNull();
  }

  beforeAll(async () => {
    const core = client.schema("core");
    expect(
      (
        await core.from("tenants").insert({
          id: tenantId,
          name: "Thread store integration",
          slug: `threads-it-${tenantId.slice(0, 8)}`,
        })
      ).error
    ).toBeNull();
    for (const [id, name] of [
      [me, "me"],
      [colleague, "colleague"],
    ]) {
      expect(
        (
          await core.from("users").insert({
            email: `threads-it-${name}-${tenantId.slice(0, 8)}@example.test`,
            id,
            tenant_id: tenantId,
          })
        ).error
      ).toBeNull();
    }
    const spaces = await core
      .from("spaces")
      .insert([
        { key: "a", name: "A", tenant_id: tenantId },
        { key: "b", name: "B", tenant_id: tenantId },
      ])
      .select("id, key");
    expect(spaces.error).toBeNull();
    spaceA = spaces.data?.find((s) => s.key === "a")?.id as string;
    spaceB = spaces.data?.find((s) => s.key === "b")?.id as string;
  });

  afterAll(async () => {
    await ai().from("thread").delete().eq("tenant_id", tenantId);
    await client.schema("core").from("tenants").delete().eq("id", tenantId);
  });

  it("lists a person's threads of one Space only — not another Space's, not Space-less ones", async () => {
    const inA = await thread({ spaceId: spaceA });
    const inB = await thread({ spaceId: spaceB });
    const noSpace = await thread({ spaceId: null });
    for (const id of [inA, inB, noSpace]) {
      await participate(id);
    }

    const rows = await store.listThreadsForUser({
      spaceId: spaceA,
      tenantId,
      userId: me,
    });

    expect(rows.map((row) => row.id)).toEqual([inA]);
  });

  it("lists the rooms an agent hosts or joined in its Space, never another Space's", async () => {
    const hosted = await thread({ agentId: "tim", spaceId: spaceA });
    const joined = await thread({ agentId: "tom", spaceId: spaceA });
    const elsewhere = await thread({ agentId: "tom", spaceId: spaceB });
    await store.addAgentMember({ agentId: "tim", tenantId, threadId: joined });
    await store.addAgentMember({
      agentId: "tim",
      tenantId,
      threadId: elsewhere,
    });

    const rows = await store.listThreadsForSpaceAgent({
      agentId: "tim",
      spaceId: spaceA,
      tenantId,
    });

    expect(rows.map((row) => row.id).sort()).toEqual([hosted, joined].sort());
  });

  it("keeps the host a host when it is added to its own room again", async () => {
    const room = await thread({ agentId: "tom", spaceId: spaceA });
    const host = await ai().from("thread_agent").insert({
      agent_id: "tom",
      role: "host",
      tenant_id: tenantId,
      thread_id: room,
    });
    expect(host.error).toBeNull();
    await store.addAgentMember({ agentId: "tim", tenantId, threadId: room });
    await store.addAgentMember({ agentId: "tim", tenantId, threadId: room });
    await store.addAgentMember({ agentId: "tom", tenantId, threadId: room });

    const members = await store.listAgentMembers({ tenantId, threadId: room });

    expect(members.map((m) => `${m.agent_id}:${m.role}`)).toEqual([
      "tom:host",
      "tim:member",
    ]);
  });

  it("lists a person's own DMs: the river without a Space, a Space's DMs within it", async () => {
    const dm = { dm: true };
    const river = await thread({ routeContext: dm, spaceId: null });
    const dmA = await thread({ routeContext: dm, spaceId: spaceA });
    await thread({ routeContext: dm, spaceId: spaceB });
    await thread({ owner: colleague, routeContext: dm, spaceId: spaceA });

    const riverRows = await store.listDmsForUser({
      spaceId: null,
      tenantId,
      userId: me,
    });
    const spaceRows = await store.listDmsForUser({
      spaceId: spaceA,
      tenantId,
      userId: me,
    });

    expect(riverRows.map((row) => row.id)).toEqual([river]);
    expect(spaceRows.map((row) => row.id)).toEqual([dmA]);
  });
});
