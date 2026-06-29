import { describe, expect, it } from "vitest";
import {
  isTitleDerivableToValidSkillName,
  titleToAgentSkillName,
} from "./title-to-agent-skill-name";

describe("titleToAgentSkillName", () => {
  it("kebab-cases and strips accents", () => {
    expect(titleToAgentSkillName("Contacts Extract Email")).toBe(
      "contacts-extract-email"
    );
    expect(titleToAgentSkillName("  Foo Bar  ")).toBe("foo-bar");
    expect(titleToAgentSkillName("Café Helper")).toBe("cafe-helper");
  });

  it("validates derivable names", () => {
    expect(isTitleDerivableToValidSkillName("Hello")).toBe(true);
    expect(isTitleDerivableToValidSkillName("")).toBe(false);
    expect(isTitleDerivableToValidSkillName("---")).toBe(false);
  });
});
