import { describe, expect, it } from "vitest";
import {
  buildHabboAvatarPrompt,
  HABBO_AVATAR_VARIATIONS,
} from "./habbo-avatar-prompt.js";

describe("buildHabboAvatarPrompt", () => {
  it("asks for Habbo isometric style and solid white background", () => {
    const prompt = buildHabboAvatarPrompt({
      outfitColor: "cobalt",
      hairStyle: "bob",
      hairColor: "auburn",
    });
    expect(prompt).toMatch(/Habbo Hotel/i);
    expect(prompt).toMatch(/isometric/i);
    expect(prompt).toMatch(/#FFFFFF/);
    expect(prompt).toMatch(/cobalt/i);
    expect(prompt).toMatch(/bob/i);
  });

  it("includes member name as vibe only", () => {
    const prompt = buildHabboAvatarPrompt({}, { memberName: "Maren" });
    expect(prompt).toContain("Maren");
    expect(prompt).toMatch(/do not render any text/i);
  });
});

describe("HABBO_AVATAR_VARIATIONS", () => {
  it("provides three labelled variants", () => {
    expect(HABBO_AVATAR_VARIATIONS).toHaveLength(3);
  });
});
