import { describe, expect, it } from "vitest";
import {
  KB_OPEN_SOURCE_ADD_STATE_KEY,
  kbOpenSourceAddLocationState,
  parseKbOpenSourceAddFromLocation,
  shouldOpenSourceAddFromLocation,
} from "../kb-open-source-add-state.js";

describe("kbOpenSourceAddLocationState", () => {
  it("defaults to legacy first-adapter preset", () => {
    expect(kbOpenSourceAddLocationState()).toEqual({
      [KB_OPEN_SOURCE_ADD_STATE_KEY]: true,
    });
  });

  it("carries manual, file upload, and adapter presets", () => {
    expect(kbOpenSourceAddLocationState("manual")).toEqual({
      [KB_OPEN_SOURCE_ADD_STATE_KEY]: "manual",
    });
    expect(kbOpenSourceAddLocationState("file_upload")).toEqual({
      [KB_OPEN_SOURCE_ADD_STATE_KEY]: "file_upload",
    });
    expect(
      kbOpenSourceAddLocationState({ adapterId: "firecrawl_url" })
    ).toEqual({
      [KB_OPEN_SOURCE_ADD_STATE_KEY]: { adapterId: "firecrawl_url" },
    });
  });
});

describe("parseKbOpenSourceAddFromLocation", () => {
  it("parses legacy and typed presets", () => {
    expect(parseKbOpenSourceAddFromLocation(null)).toBeNull();
    expect(
      parseKbOpenSourceAddFromLocation({ [KB_OPEN_SOURCE_ADD_STATE_KEY]: true })
    ).toBe(true);
    expect(
      parseKbOpenSourceAddFromLocation({
        [KB_OPEN_SOURCE_ADD_STATE_KEY]: "manual",
      })
    ).toBe("manual");
    expect(
      parseKbOpenSourceAddFromLocation({
        [KB_OPEN_SOURCE_ADD_STATE_KEY]: { adapterId: "url" },
      })
    ).toEqual({ adapterId: "url" });
  });

  it("shouldOpenSourceAddFromLocation mirrors parse", () => {
    expect(shouldOpenSourceAddFromLocation({})).toBe(false);
    expect(
      shouldOpenSourceAddFromLocation({
        [KB_OPEN_SOURCE_ADD_STATE_KEY]: "file_upload",
      })
    ).toBe(true);
  });
});
