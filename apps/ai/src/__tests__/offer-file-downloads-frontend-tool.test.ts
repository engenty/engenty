import { describe, expect, it } from "vitest";
import { getServerFrontendToolCatalog } from "../../ai/frontend-tools/catalog.js";

describe("offer_file_downloads frontend tool catalog", () => {
  it("resolves the offer_file_downloads tool from the Copilot module catalog", () => {
    const tool = getServerFrontendToolCatalog().find(
      (candidate) => candidate.name === "offer_file_downloads"
    );

    expect(tool).toMatchObject({
      description: expect.stringContaining("download"),
      metadata: {
        engenty: {
          availability: "enabled",
          title: "Offer File Downloads",
        },
      },
      parameters: {
        additionalProperties: false,
        properties: {
          files: {
            type: "array",
            items: {
              properties: {
                key: { type: "string" },
              },
              required: ["key"],
            },
          },
        },
        required: ["files"],
        type: "object",
      },
    });
  });
});
