import { describe, expect, it } from "vitest";
import { hotkeyDisplayTokens } from "./hotkey-display";

describe("hotkeyDisplayTokens", () => {
  it("splits macOS symbol chords on spaces", () => {
    expect(hotkeyDisplayTokens("Mod+Shift+F", { platform: "mac" })).toEqual([
      "⌘",
      "⇧",
      "F",
    ]);
  });

  it("splits Windows chords on plus", () => {
    expect(hotkeyDisplayTokens("Mod+K", { platform: "windows" })).toEqual([
      "Ctrl",
      "K",
    ]);
  });
});
