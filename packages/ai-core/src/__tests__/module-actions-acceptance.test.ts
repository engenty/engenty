// Phase 3 acceptance: every ACTION.md under modules/*/ai/actions must parse
// through the same loader the registry / GET /ai/v1/actions path uses, and
// must be serializable for the module capability channel.
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadActionDefinitionsFromDirectory } from "../actions/loader.js";
import { toModuleActionCapability } from "../dynamic-contracts.js";

const MODULES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "modules"
);

function countActionFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countActionFiles(join(dir, entry.name));
    } else if (entry.isFile() && entry.name === "ACTION.md") {
      count += 1;
    }
  }
  return count;
}

describe("module ACTION.md acceptance", () => {
  it("parses every modules/*/ai/actions ACTION.md via the registry loader", () => {
    const moduleIds = readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((moduleId) =>
        existsSync(join(MODULES_DIR, moduleId, "ai", "actions"))
      );

    let fileCount = 0;
    const actionIds: string[] = [];
    for (const moduleId of moduleIds) {
      const actionsDir = join(MODULES_DIR, moduleId, "ai", "actions");
      fileCount += countActionFiles(actionsDir);
      const actions = loadActionDefinitionsFromDirectory({
        actionsDir,
        moduleId,
      });
      for (const action of actions) {
        expect(action.agent_id).toBeTruthy();
        expect(action.prompt).toBeTruthy();
        // Every action must survive the serializable capability projection.
        const capability = toModuleActionCapability(action);
        expect(capability.input_schema_json).toBeTypeOf("object");
        expect(() => JSON.stringify(capability)).not.toThrow();
        actionIds.push(action.id);
      }
    }

    // Every ACTION.md file resolves to exactly one parsed definition.
    expect(actionIds).toHaveLength(fileCount);
    expect(new Set(actionIds).size).toBe(actionIds.length);
    // Open base may ship fewer modules than the full product; still require parity
    // between ACTION.md files on disk and parsed definitions.
    expect(actionIds.length).toBe(fileCount);
  });
});
