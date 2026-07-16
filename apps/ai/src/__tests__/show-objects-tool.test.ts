import { beforeEach, describe, expect, it, vi } from "vitest";
import { EngentyCoreHttpError } from "../ai/core-http-client.js";

const invokeTool = vi.fn();

vi.mock("../../ai/tools/engenty-tools/lib/client.js", () => ({
  getCurrentEngentyToolsClient: () => ({
    ok: true,
    client: { invokeTool },
  }),
}));

const { createShowObjectsTool, snapshotFromRecord } = await import(
  "../../ai/tools/show-objects-tool.js"
);

function readMeta(output: unknown) {
  return (
    output as {
      _meta?: { engenty?: { object_render?: Record<string, unknown> } };
    }
  )._meta?.engenty?.object_render;
}

describe("snapshotFromRecord", () => {
  const ref = { module: "contacts", entity: "contact", id: "c1" };

  it("picks title, subtitle, and status generically", () => {
    expect(
      snapshotFromRecord(ref, {
        name: "ACME GmbH",
        city: "Vienna",
        status: "active",
      })
    ).toEqual({
      ref: "contacts:contact:c1",
      title: "ACME GmbH",
      subtitle: "Vienna",
      status: "active",
    });
  });

  it("falls back to the id and skips subtitle duplicating the title", () => {
    expect(snapshotFromRecord(ref, { email: "a@b.c" })).toEqual({
      ref: "contacts:contact:c1",
      title: "a@b.c",
    });
    expect(snapshotFromRecord(ref, {}).title).toBe("c1");
  });
});

describe("show_objects execute", () => {
  beforeEach(() => {
    invokeTool.mockReset();
  });

  it("renders resolvable refs and drops unauthorized ones", async () => {
    invokeTool.mockImplementation((toolId: string, input: { id: string }) => {
      if (input.id === "denied") {
        throw new EngentyCoreHttpError("forbidden", 403, "forbidden");
      }
      if (input.id === "missing") {
        return Promise.resolve(null);
      }
      return Promise.resolve({ name: `Record ${input.id}`, status: "open" });
    });
    const tool = createShowObjectsTool();
    const output = await tool.execute!({
      refs: [
        "contacts:contact:a",
        "contacts:contact:denied",
        "offers:offer:missing",
        "not-a-ref",
      ],
      query: "acme",
      total: 4,
    } as never);

    expect(output).toMatchObject({
      ok: true,
      shown: 1,
      dropped: 2,
      invalid: 1,
    });
    const meta = readMeta(output);
    expect(meta?.refs).toEqual(["contacts:contact:a"]);
    expect(meta?.dropped).toEqual([
      "contacts:contact:denied",
      "offers:offer:missing",
    ]);
    expect(meta?.items).toEqual([
      { ref: "contacts:contact:a", title: "Record a", status: "open" },
    ]);
    expect(meta?.provenance).toEqual({ total: 4, query: "acme" });
    expect(invokeTool).toHaveBeenCalledWith("contacts_get", { id: "a" });
    expect(invokeTool).toHaveBeenCalledWith("offers_get", { id: "missing" });
  });

  it("keeps refs renderable when the module has no read op", async () => {
    invokeTool.mockRejectedValue(
      new EngentyCoreHttpError("operation not found", 404, "not_found")
    );
    const tool = createShowObjectsTool();
    const output = await tool.execute!({
      refs: ["custom:thing:x"],
    } as never);
    expect(output).toMatchObject({ ok: true, shown: 1, dropped: 0 });
    expect(readMeta(output)?.items).toEqual([]);
  });

  it("fails cleanly when nothing survives", async () => {
    invokeTool.mockResolvedValue(null);
    const tool = createShowObjectsTool();
    const output = await tool.execute!({
      refs: ["contacts:contact:gone"],
    } as never);
    expect(output).toMatchObject({ ok: false, shown: 0, dropped: 1 });
    expect(readMeta(output)).toBeUndefined();
  });

  it("uses the team override for team members", async () => {
    invokeTool.mockResolvedValue({ name: "Jo" });
    const tool = createShowObjectsTool();
    await tool.execute!({ refs: ["team:member:m1"] } as never);
    expect(invokeTool).toHaveBeenCalledWith("team_get", { id: "m1" });
  });
});
