import { describe, expect, it } from "vitest";
import { parseVoiceProposeUpdatesArgs } from "./voice-propose-updates-tool.js";

describe("parseVoiceProposeUpdatesArgs", () => {
  it("parses a valid proposal with suggestions", () => {
    const parsed = parseVoiceProposeUpdatesArgs({
      context_id: "contact-1",
      context_type: "contacts.contact",
      suggestions: [
        {
          evidence_snippet: "Impressum shows 8952 Irdning.",
          field: "address_zip",
          source_url: "https://anwalt-unger.at/?page_id=6",
          value: "8952",
        },
        { field: "legal_name", value: null },
      ],
      title: "Review suggested updates",
    });
    expect(parsed).toEqual({
      contextId: "contact-1",
      contextType: "contacts.contact",
      suggestions: [
        {
          evidence_snippet: "Impressum shows 8952 Irdning.",
          field: "address_zip",
          source_url: "https://anwalt-unger.at/?page_id=6",
          value: "8952",
        },
        { field: "legal_name", value: null },
      ],
      title: "Review suggested updates",
    });
  });

  it("accepts a JSON-string arguments payload", () => {
    const parsed = parseVoiceProposeUpdatesArgs(
      JSON.stringify({
        context_id: "c1",
        context_type: "contacts.contact",
        suggestions: [{ field: "x", value: "y" }],
      })
    );
    expect(parsed?.suggestions).toHaveLength(1);
  });

  it("returns null when context is missing", () => {
    expect(
      parseVoiceProposeUpdatesArgs({
        suggestions: [{ field: "x", value: "y" }],
      })
    ).toBeNull();
  });

  it("returns null when no valid suggestions remain", () => {
    expect(
      parseVoiceProposeUpdatesArgs({
        context_id: "c1",
        context_type: "contacts.contact",
        suggestions: [{ value: "no field" }],
      })
    ).toBeNull();
  });
});
