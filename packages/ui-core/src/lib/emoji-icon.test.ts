import { describe, expect, it } from "vitest";
import {
  countEmojiGraphemes,
  EMOJI_ICON_PRESETS,
  isSingleEmoji,
  normalizeEmojiInput,
} from "./emoji-icon.js";

describe("EMOJI_ICON_PRESETS", () => {
  it("ships twenty curated icons", () => {
    expect(EMOJI_ICON_PRESETS).toHaveLength(20);
  });
});

describe("isSingleEmoji", () => {
  it("accepts a single preset emoji", () => {
    expect(isSingleEmoji("📚")).toBe(true);
  });

  it("accepts compound emoji as one grapheme", () => {
    expect(isSingleEmoji("⚙️")).toBe(true);
    expect(countEmojiGraphemes("⚙️")).toBe(1);
  });

  it("rejects empty, whitespace, and multi-character input", () => {
    expect(isSingleEmoji("")).toBe(false);
    expect(isSingleEmoji("   ")).toBe(false);
    expect(isSingleEmoji("📚📚")).toBe(false);
    expect(isSingleEmoji("ab")).toBe(false);
  });
});

describe("normalizeEmojiInput", () => {
  it("returns trimmed emoji when valid", () => {
    expect(normalizeEmojiInput("  🚀  ")).toBe("🚀");
  });

  it("returns null for invalid input", () => {
    expect(normalizeEmojiInput("hello")).toBeNull();
  });
});
