import { describe, expect, it } from "vitest";
import { normalizeImportRowTaxonomyColumns } from "./import-team-members.js";

describe("normalizeImportRowTaxonomyColumns", () => {
  it("copies legacy location into location_term when taxonomy column is empty", () => {
    const row = normalizeImportRowTaxonomyColumns({
      full_name: "Jane",
      location: "Vienna",
    });
    expect(row.location_term).toBe("Vienna");
    expect(row.location).toBe("Vienna");
  });

  it("prefers explicit location_term over legacy location", () => {
    const row = normalizeImportRowTaxonomyColumns({
      location: "Legacy",
      location_term: "Vienna",
    });
    expect(row.location_term).toBe("Vienna");
  });
});
