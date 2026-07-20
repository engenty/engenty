import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "./fake-supabase.js";

const ROWS = [
  {
    id: "a",
    name: "Alpha",
    rank: 3,
    roles: ["admin", "user"],
    tenant_id: "t1",
  },
  { id: "b", name: "Beta", rank: 1, roles: ["user"], tenant_id: "t1" },
  { id: "c", name: "Gamma", rank: 2, roles: ["user"], tenant_id: "t2" },
];

function seeded() {
  return createFakeSupabase({ tables: { items: ROWS } });
}

describe("createFakeSupabase — filtering", () => {
  it("applies eq filters instead of returning all seeded rows", async () => {
    const supabase = seeded();
    const { data, error } = await supabase
      .schema("app")
      .from("items")
      .select("*")
      .eq("tenant_id", "t1");
    expect(error).toBeNull();
    expect((data as { id: string }[]).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("combines in, order, and range like PostgREST", async () => {
    const supabase = seeded();
    const { data } = await supabase
      .from("items")
      .select("*")
      .in("tenant_id", ["t1", "t2"])
      .order("rank", { ascending: false })
      .range(0, 1);
    expect((data as { rank: number }[]).map((row) => row.rank)).toEqual([3, 2]);
  });

  it("supports or() with eq/is/in conditions", async () => {
    const supabase = seeded();
    const { data } = await supabase
      .from("items")
      .select("*")
      .or("rank.eq.1,tenant_id.in.(t2)");
    expect((data as { id: string }[]).map((row) => row.id).sort()).toEqual([
      "b",
      "c",
    ]);
  });

  it("supports contains() for array containment", async () => {
    const supabase = seeded();
    const { data } = await supabase
      .from("items")
      .select("*")
      .contains("roles", ["admin"]);
    expect((data as { id: string }[]).map((row) => row.id)).toEqual(["a"]);
  });

  it("maybeSingle returns null on no match and the row on one match", async () => {
    const supabase = seeded();
    const missing = await supabase
      .from("items")
      .select("*")
      .eq("id", "nope")
      .maybeSingle();
    expect(missing).toEqual({ data: null, error: null });

    const found = await supabase
      .from("items")
      .select("*")
      .eq("id", "b")
      .maybeSingle();
    expect((found.data as { name: string }).name).toBe("Beta");
  });

  it("single errors when more than one row matches", async () => {
    const supabase = seeded();
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("tenant_id", "t1")
      .single();
    expect(data).toBeNull();
    expect(error?.message).toContain("more than one row");
  });
});

describe("createFakeSupabase — mutations and store", () => {
  it("insert appends and update mutates only filtered rows", async () => {
    const supabase = seeded();
    await supabase.from("items").insert({ id: "d", rank: 9, tenant_id: "t3" });
    expect(supabase.getRows("items")).toHaveLength(4);

    await supabase.from("items").update({ rank: 99 }).eq("tenant_id", "t1");
    const ranks = supabase
      .getRows("items")
      .map((row) => [row.id, row.rank] as const);
    expect(ranks).toContainEqual(["a", 99]);
    expect(ranks).toContainEqual(["b", 99]);
    expect(ranks).toContainEqual(["c", 2]);
  });

  it("upsert replaces by id and delete removes filtered rows", async () => {
    const supabase = seeded();
    await supabase.from("items").upsert({ id: "a", name: "Alpha 2" });
    expect(supabase.getRows("items")).toHaveLength(3);
    expect(supabase.getRows("items").find((row) => row.id === "a")?.name).toBe(
      "Alpha 2"
    );

    await supabase.from("items").delete().eq("tenant_id", "t1");
    expect(supabase.getRows("items").map((row) => row.id)).toEqual(["c"]);
  });

  it("queueError fails only the next query on that table", async () => {
    const supabase = seeded();
    supabase.queueError("items", "boom");
    const failed = await supabase.from("items").select("*");
    expect(failed.error?.message).toBe("boom");
    const ok = await supabase.from("items").select("*");
    expect(ok.error).toBeNull();
  });
});

describe("createFakeSupabase — recording and rpc", () => {
  it("records calls per table for boundary assertions", async () => {
    const supabase = seeded();
    await supabase.from("items").select("*").eq("tenant_id", "t1");
    const recorded = supabase.calls.get("items") ?? [];
    expect(recorded.map((call) => call.method)).toEqual(["select", "eq"]);
    expect(recorded[1]?.args).toEqual(["tenant_id", "t1"]);
  });

  it("routes rpc through per-function handlers with recorded args", async () => {
    const supabase = createFakeSupabase({
      rpc: { fuse: (args) => ({ echoed: args.query }) },
    });
    const { data } = await supabase.rpc("fuse", { query: "hello" });
    expect(data).toEqual({ echoed: "hello" });
    expect(supabase.rpcCalls).toEqual([
      { args: { query: "hello" }, fn: "fuse" },
    ]);
  });
});
