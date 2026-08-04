import artifactsAndDownloadsSkill from "./artifacts-and-downloads/SKILL.md";
import inspectUiDomSkill from "./inspect-ui-dom/SKILL.md";
import sandboxCodeExecutionSkill from "./sandbox-code-execution/SKILL.md";
import showRecordsSkill from "./show-records/SKILL.md";

// Builtin copilot skills. The copilot is a builtin agent (assembled in apps/ai),
// so its skills ship with the package as raw SKILL.md text rather than through
// the module capability HTTP channel. apps/ai seeds these into the tenant
// `/skills/managed` tree so the copilot (which mounts `/skills`) discovers them.
// Keyed by skill folder name (matches the `name` frontmatter).
export const ENGENTY_COPILOT_MANAGED_SKILLS: Record<string, string> = {
  "artifacts-and-downloads": artifactsAndDownloadsSkill,
  "inspect-ui-dom": inspectUiDomSkill,
  "sandbox-code-execution": sandboxCodeExecutionSkill,
  "show-records": showRecordsSkill,
};
