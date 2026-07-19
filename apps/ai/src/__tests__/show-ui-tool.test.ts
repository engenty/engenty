import { describe, expect, it } from "vitest";
import { createShowUiTool } from "../../ai/tools/show-ui-tool.js";

describe("show_ui tool", () => {
  it("validates and emits the a2ui meta for the chat card", async () => {
    const tool = createShowUiTool();
    const output = (await tool.execute?.({
      components: [
        { id: "root", component: "List", children: ["t"] },
        { id: "t", component: "Text", text: { path: "/msg" } },
      ],
      data: { msg: "hi" },
      title: "Demo",
    })) as Record<string, unknown>;
    expect(output.ok).toBe(true);
    const a2ui = (
      output._meta as { engenty: { a2ui: Record<string, unknown> } }
    ).engenty.a2ui;
    expect(a2ui.catalog_id).toBe("engenty:core/v1");
    expect(typeof a2ui.surface_id).toBe("string");
    expect(Array.isArray(a2ui.messages)).toBe(true);
    expect((a2ui.messages as unknown[]).length).toBe(3);
  });

  it("rejects invalid payloads agent-side so the model can retry", async () => {
    const tool = createShowUiTool();
    const output = (await tool.execute?.({
      components: [{ id: "root", component: "Marquee" }],
    })) as Record<string, unknown>;
    expect(output.ok).toBe(false);
    expect(output._meta).toBeUndefined();
    expect(Array.isArray(output.issues)).toBe(true);
  });
});
