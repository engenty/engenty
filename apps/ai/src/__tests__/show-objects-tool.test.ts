import { describe, expect, it, vi } from "vitest";
import { EngentyCoreHttpError } from "../ai/core-http-client.js";
import { testToolContext } from "./helpers/tool-context.js";

const invokeTool = vi.fn();

vi.mock("../../ai/tools/engenty-tools/lib/client.js", () => ({
  getCurrentEngentyToolsClient: () => ({
    ok: true,
    client: { invokeTool },
  }),
}));

const { createShowObjectsTool } = await import(
  "../../ai/tools/show-objects-tool.js"
);

describe("show_objects execute", () => {
  it("keeps records the viewer may not read out of the card", async () => {
    invokeTool.mockImplementation((_toolId: string, input: { id: string }) => {
      if (input.id === "denied") {
        throw new EngentyCoreHttpError("forbidden", 403, "forbidden");
      }
      return Promise.resolve({ name: `Record ${input.id}` });
    });

    const output = (await createShowObjectsTool().execute!(
      { refs: ["contacts:contact:a", "contacts:contact:denied"] } as never,
      testToolContext()
    )) as {
      _meta: {
        engenty: {
          object_render: { items: { ref: string }[]; refs: string[] };
        };
      };
      dropped: number;
    };

    const render = output._meta.engenty.object_render;
    expect(output.dropped).toBe(1);
    expect(render.refs).toEqual(["contacts:contact:a"]);
    expect(render.items.map((item) => item.ref)).toEqual([
      "contacts:contact:a",
    ]);
  });
});
