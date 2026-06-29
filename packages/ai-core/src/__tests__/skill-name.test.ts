import { describe, expect, it } from "vitest";
import {
  AGENT_SKILL_NAME_MAX_LENGTH,
  AGENT_SKILL_NAME_POSTGRES_PATTERN,
  assertValidAgentSkillName,
  isValidAgentSkillName,
} from "../skill-name.js";
import {
  INVALID_AGENT_SKILL_NAME_FIXTURES,
  VALID_AGENT_SKILL_NAME_FIXTURES,
} from "./skill-name-spec-harness.js";

/** Same acceptance as {@link isValidAgentSkillName} via {@link AGENT_SKILL_NAME_POSTGRES_PATTERN}. */
function matchesPostgresNameCheck(name: string): boolean {
  if (!name || name.length < 1 || name.length > AGENT_SKILL_NAME_MAX_LENGTH) {
    return false;
  }
  return new RegExp(AGENT_SKILL_NAME_POSTGRES_PATTERN).test(name);
}

describe("skill-name", () => {
  it.each([
    ...VALID_AGENT_SKILL_NAME_FIXTURES,
  ])("accepts valid fixture %s", (name) => {
    expect(isValidAgentSkillName(name)).toBe(true);
    expect(matchesPostgresNameCheck(name)).toBe(true);
  });

  it.each([
    ...INVALID_AGENT_SKILL_NAME_FIXTURES,
  ])("rejects invalid fixture %j", (name) => {
    expect(isValidAgentSkillName(name)).toBe(false);
    expect(matchesPostgresNameCheck(name)).toBe(false);
  });

  it("assertValidAgentSkillName throws with a clear message", () => {
    expect(() => assertValidAgentSkillName("NO")).toThrow(/Invalid skill name/);
  });

  it("matches Postgres CHECK for random slug samples (parity harness)", () => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789-";
    for (let i = 0; i < 300; i += 1) {
      const len = 1 + Math.floor(Math.random() * 80);
      let s = "";
      for (let j = 0; j < len; j += 1) {
        s += alphabet[Math.floor(Math.random() * alphabet.length)]!;
      }
      expect(isValidAgentSkillName(s)).toBe(matchesPostgresNameCheck(s));
    }
  });
});
