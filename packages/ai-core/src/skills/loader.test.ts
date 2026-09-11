import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSkillDefinitionsFromDirectory } from "./loader.js";

describe("loadSkillDefinitionsFromDirectory", () => {
  it("loads one skill per immediate subdirectory that has SKILL.md", () => {
    const skillsDir = mkdtempSync(join(tmpdir(), "engenty-skill-loader-"));
    const packDir = join(skillsDir, "engenty-safe-automation");
    mkdirSync(packDir);
    writeFileSync(
      join(packDir, "SKILL.md"),
      `---
name: engenty-safe-automation
title: Safe automation
description: Apply shared automation and approval safety guidance.
metadata:
  owner_id: engenty.copilot
---

# Safe automation
`
    );

    const defs = loadSkillDefinitionsFromDirectory({
      defaultMetadata: {},
      moduleId: "engenty-core",
      skillsDir,
    });
    expect(defs.map((d) => d.name).toSorted()).toEqual([
      "engenty-safe-automation",
    ]);
    const safe = defs.find((d) => d.name === "engenty-safe-automation");
    expect(safe?.title).toBe("Safe automation");
    expect(safe?.metadata?.module_id).toBe("engenty-core");
    expect(safe?.metadata?.owner_id).toBe("engenty.copilot");
  });
});
