import { describe, expect, it } from "vitest";
import {
  isBrowserReparseEngine,
  type ReparseEngine,
} from "./reparse-work-file.js";

describe("isBrowserReparseEngine", () => {
  it("treats WASM parsers as browser engines", () => {
    expect(isBrowserReparseEngine("anydoc")).toBe(true);
    expect(isBrowserReparseEngine("liteparse-wasm")).toBe(true);
  });

  it("treats doc-converter backends as server engines", () => {
    const servers: ReparseEngine[] = [
      "local",
      "liteparse",
      "llamaparse",
      "mistral",
      "gemini",
    ];
    for (const engine of servers) {
      expect(isBrowserReparseEngine(engine)).toBe(false);
    }
  });
});
