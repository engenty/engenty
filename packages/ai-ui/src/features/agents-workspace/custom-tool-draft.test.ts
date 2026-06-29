import { describe, expect, it } from "vitest";
import type { CustomToolConfig } from "../../lib/admin/ai-runtime-api";
import {
  buildCustomToolConfigFromDraft,
  createCustomToolDraft,
  parseCustomToolSchemaJson,
  validateCustomToolDraft,
} from "./custom-tool-draft";

const tool: CustomToolConfig = {
  description: "Searches CRM records.",
  endpointUrl: "https://tools.example.test/search",
  id: "tenant.crm-search",
  name: "CRM search",
  schemaJson: {
    properties: { query: { type: "string" } },
    type: "object",
  },
};

describe("custom-tool-draft", () => {
  it("round-trips a dynamic tool config through the form draft", () => {
    expect(buildCustomToolConfigFromDraft(createCustomToolDraft(tool))).toEqual(
      tool
    );
  });

  it("validates dynamic tool JSON schema and required fields", () => {
    expect(
      validateCustomToolDraft({ ...createCustomToolDraft(tool), id: "Bad" })
    ).toContain("Tool id");
    expect(
      validateCustomToolDraft({ ...createCustomToolDraft(tool), name: "" })
    ).toContain("Tool name");
    expect(
      validateCustomToolDraft({
        ...createCustomToolDraft(tool),
        endpointUrl: "",
      })
    ).toContain("Endpoint URL");
    expect(
      validateCustomToolDraft({
        ...createCustomToolDraft(tool),
        schemaJsonText: "[]",
      })
    ).toContain("Tool schema");
  });

  it("parses blank dynamic tool schema as an empty object", () => {
    expect(parseCustomToolSchemaJson(" ")).toEqual({});
  });
});
