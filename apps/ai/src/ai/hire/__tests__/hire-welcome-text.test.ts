import { describe, expect, it } from "vitest";
import {
  fallbackHireWelcome,
  hireWelcomeUserPrompt,
} from "../hire-welcome-text.js";

const base = {
  connectors: [] as string[],
  description: "Sets the space up and routes work.",
  locale: "en",
  modules: [] as string[],
  name: "Chief of Staff",
  spaceName: "engrd",
};

describe("fallbackHireWelcome", () => {
  it("names the Engenty, the space, and asks for a first job", () => {
    const text = fallbackHireWelcome(base);
    expect(text).toContain("Chief of Staff");
    expect(text).toContain("engrd");
    expect(text).toContain("Sets the space up and routes work.");
    expect(text).toMatch(/mount Files or Connections/i);
  });

  it("writes German when the locale is de", () => {
    const text = fallbackHireWelcome({ ...base, locale: "de-DE" });
    expect(text.startsWith("Hallo")).toBe(true);
    expect(text).toContain("engrd");
    expect(text).toMatch(/Files oder Connections/i);
  });

  it("does not tell them to mount apps when some are already there", () => {
    const text = fallbackHireWelcome({
      ...base,
      modules: ["files", "connections"],
    });
    expect(text).not.toMatch(/mount Files/i);
    expect(text).toMatch(/look at what's already here/i);
  });
});

describe("hireWelcomeUserPrompt", () => {
  it("lists the job and the mounts", () => {
    const prompt = hireWelcomeUserPrompt({
      ...base,
      connectors: ["google-gmail"],
      modules: ["files"],
    });
    expect(prompt).toContain("Chief of Staff");
    expect(prompt).toContain("files");
    expect(prompt).toContain("google-gmail");
  });
});
