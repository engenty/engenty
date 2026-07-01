import { describe, expect, it } from "vitest";
import {
  deriveInitialsFromParts,
  formatDisplayName,
  isContactNameWriteValid,
  resolveContactNameForWrite,
  splitFullNameHeuristic,
} from "./contact-name.js";

describe("formatDisplayName", () => {
  it("formats German-style name with prefix and suffix", () => {
    expect(
      formatDisplayName({
        name_prefix: "Dr.",
        first_name: "Max",
        last_name: "Mustermann",
        name_suffix: "MBA",
      })
    ).toBe("Dr. Max Mustermann MBA");
  });
});

describe("splitFullNameHeuristic", () => {
  it("splits simple two-token name", () => {
    expect(splitFullNameHeuristic("Matthias Platzer")).toEqual({
      name_prefix: null,
      first_name: "Matthias",
      middle_name: null,
      last_name: "Platzer",
      name_suffix: null,
      phonetic_name: null,
      birth_name: null,
      full_name_override: null,
    });
  });

  it("detects prefix and suffix tokens", () => {
    expect(splitFullNameHeuristic("Dr. Anna Schmidt MBA")).toMatchObject({
      name_prefix: "Dr.",
      first_name: "Anna",
      last_name: "Schmidt",
      name_suffix: "MBA",
    });
  });
});

describe("resolveContactNameForWrite", () => {
  it("derives display_name from parts", () => {
    const { display_name } = resolveContactNameForWrite({
      first_name: "Max",
      last_name: "Mustermann",
    });
    expect(display_name).toBe("Max Mustermann");
  });

  it("uses display_name_override when set", () => {
    const { display_name } = resolveContactNameForWrite({
      first_name: "Max",
      last_name: "Mustermann",
      display_name_override: "M. Mustermann (Display)",
    });
    expect(display_name).toBe("M. Mustermann (Display)");
  });

  it("splits legacy display_name when parts empty", () => {
    const { parts, display_name } = resolveContactNameForWrite({
      display_name: "Matthias Platzer",
    });
    expect(display_name).toBe("Matthias Platzer");
    expect(parts.last_name).toBe("Platzer");
  });
});

describe("isContactNameWriteValid", () => {
  it("requires last name when structured parts are present", () => {
    expect(isContactNameWriteValid({ first_name: "Alex", last_name: "" })).toBe(
      false
    );
    expect(
      isContactNameWriteValid({ first_name: "Alex", last_name: "Example" })
    ).toBe(true);
  });

  it("accepts legacy display_name without structured parts", () => {
    expect(isContactNameWriteValid({ display_name: "Jane Doe" })).toBe(true);
  });

  it("accepts display name override", () => {
    expect(
      isContactNameWriteValid({ display_name_override: "Stage Name" })
    ).toBe(true);
  });
});

describe("deriveInitialsFromParts", () => {
  it("returns first and last initials", () => {
    expect(
      deriveInitialsFromParts({ first_name: "Matthias", last_name: "Platzer" })
    ).toBe("MP");
  });
});
