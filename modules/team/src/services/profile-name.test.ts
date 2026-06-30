import { describe, expect, it } from "vitest";
import {
  deriveInitialsFromParts,
  formatDisplayName,
  isProfileNameWriteValid,
  resolveProfileNameForWrite,
  splitFullNameHeuristic,
} from "./profile-name.js";

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

describe("resolveProfileNameForWrite", () => {
  it("derives full_name from parts", () => {
    const { full_name, initials } = resolveProfileNameForWrite({
      first_name: "Max",
      last_name: "Mustermann",
    });
    expect(full_name).toBe("Max Mustermann");
    expect(initials).toBe("MM");
  });

  it("uses full_name_override when set", () => {
    const { full_name } = resolveProfileNameForWrite({
      first_name: "Max",
      last_name: "Mustermann",
      full_name_override: "M. Mustermann (Display)",
    });
    expect(full_name).toBe("M. Mustermann (Display)");
  });

  it("splits legacy full_name when parts empty", () => {
    const { parts, full_name } = resolveProfileNameForWrite({
      full_name: "Matthias Platzer",
    });
    expect(full_name).toBe("Matthias Platzer");
    expect(parts.last_name).toBe("Platzer");
  });
});

describe("isProfileNameWriteValid", () => {
  it("requires last name when structured parts are present", () => {
    expect(isProfileNameWriteValid({ first_name: "Alex", last_name: "" })).toBe(
      false
    );
    expect(
      isProfileNameWriteValid({ first_name: "Alex", last_name: "Example" })
    ).toBe(true);
  });

  it("accepts legacy full_name without structured parts", () => {
    expect(isProfileNameWriteValid({ full_name: "Jane Doe" })).toBe(true);
  });

  it("accepts display name override", () => {
    expect(isProfileNameWriteValid({ full_name_override: "Stage Name" })).toBe(
      true
    );
  });
});

describe("deriveInitialsFromParts", () => {
  it("returns first and last initials", () => {
    expect(
      deriveInitialsFromParts({ first_name: "Matthias", last_name: "Platzer" })
    ).toBe("MP");
  });
});
