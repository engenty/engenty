// CLI Agent tool IDs — same catalog + vault surface as the copilot so the
// agent can discover and execute registered backend operations from the sandbox.
import {
  ENGENTY_CATALOG_TOOL_IDS,
  ENGENTY_MEMORY_TOOL_IDS,
  ENGENTY_VAULT_TOOL_IDS,
} from "@engenty/engenty-copilot/ai";

export const ENGENTY_CLI_TOOL_IDS: string[] = [
  ...ENGENTY_CATALOG_TOOL_IDS,
  ...ENGENTY_MEMORY_TOOL_IDS,
  ...ENGENTY_VAULT_TOOL_IDS,
];
