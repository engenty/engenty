import type { SkillDefinition } from "../contracts.js";
import {
  loadSkillDefinitionsFromDirectory,
  resolveBuiltinSkillsSeedDir,
} from "./loader.js";

export function getBuiltinSkillDefinitions(): SkillDefinition[] {
  return loadSkillDefinitionsFromDirectory({
    defaultMetadata: {},
    moduleId: "engenty-core",
    skillsDir: resolveBuiltinSkillsSeedDir(import.meta.url),
  });
}
