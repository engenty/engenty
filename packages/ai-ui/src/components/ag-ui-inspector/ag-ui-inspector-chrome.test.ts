import { describe, expect, it } from "vitest";
import { formatDisplayText } from "./ag-ui-inspector-chrome.js";

describe("formatDisplayText", () => {
  it("pretty-prints minified JSON objects", () => {
    const input = '{"artifact_id":"abc","choice_id":"auto"}';
    expect(formatDisplayText(input)).toBe(
      '{\n  "artifact_id": "abc",\n  "choice_id": "auto"\n}'
    );
  });

  it("leaves plain text unchanged", () => {
    const input = "Waiting for the next copilot run…";
    expect(formatDisplayText(input)).toBe(input);
  });

  it("leaves invalid JSON-looking text unchanged", () => {
    const input = "{not valid json";
    expect(formatDisplayText(input)).toBe(input);
  });
});
