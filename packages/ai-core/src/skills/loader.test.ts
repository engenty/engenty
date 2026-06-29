import { describe, expect, it } from "vitest";
import {
  loadSkillDefinitionsFromDirectory,
  resolveBuiltinSkillsSeedDir,
} from "./loader.js";

describe("loadSkillDefinitionsFromDirectory", () => {
  it("loads engenty-core seed skills from src/skills/seed", () => {
    const seedDir = resolveBuiltinSkillsSeedDir(import.meta.url);
    const defs = loadSkillDefinitionsFromDirectory({
      defaultMetadata: {},
      moduleId: "engenty-core",
      skillsDir: seedDir,
    });
    expect(defs.map((d) => d.name).toSorted()).toEqual([
      "engenty-assistant-voice",
      "engenty-safe-automation",
    ]);
    const safe = defs.find((d) => d.name === "engenty-safe-automation");
    expect(safe?.title).toBe("Safe automation");
    expect(safe?.metadata?.module_id).toBe("engenty-core");
    expect(safe?.metadata?.owner_id).toBe("engenty.copilot");
  });
});
