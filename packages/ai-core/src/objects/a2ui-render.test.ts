import { describe, expect, it } from "vitest";
import { readA2uiRenderMeta } from "./a2ui-render.js";

describe("readA2uiRenderMeta", () => {
  it("reads a live inbox dashboard marker", () => {
    const meta = readA2uiRenderMeta({
      _meta: {
        engenty: {
          a2ui: {
            catalog_id: "engenty:core/v1",
            live: {
              kind: "inbox_dashboard",
              included: ["metrics", "mail"],
              layout: "list-only",
              connection_id: "conn-1",
            },
            messages: [{ version: "v0.9", createSurface: { surfaceId: "s1" } }],
            surface_id: "s1",
            title: "Inbox",
          },
        },
      },
    });
    expect(meta?.live).toEqual({
      connection_id: "conn-1",
      included: ["metrics", "mail"],
      kind: "inbox_dashboard",
      layout: "list-only",
    });
    expect(meta?.title).toBe("Inbox");
  });
});
