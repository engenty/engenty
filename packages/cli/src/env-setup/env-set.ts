import {
  isPortlessOwned,
  parseEnvDocument,
  setValue,
} from "./env-file-document.js";
import {
  envFilePath,
  loadScopeDocument,
  maskSecret,
  saveScopeDocument,
} from "./env-files.js";
import { findSpec } from "./env-manifest.js";
import type { EnvScope } from "./env-manifest-types.js";
import { manifestScope } from "./env-manifest-types.js";
import { dim, green } from "./env-style.js";

export interface EnvSetParams {
  force: boolean;
  key: string;
  /**
   * Whether the manifest holds every variable. False outside a checkout, where
   * module contributions are not on disk and an unknown key means "not core",
   * not "misspelled".
   */
  manifestComplete: boolean;
  scope: EnvScope;
  value: string;
  workspaceRoot: string;
}

/**
 * The non-interactive sibling of `env edit`, which prompts. One line, so a
 * README or a script can state it — which matters most for a managed install,
 * where there is no checkout to open in an editor.
 */
export function runEnvSet(params: EnvSetParams): number {
  const spec = findSpec(params.key);
  if (!(spec || params.force || !params.manifestComplete)) {
    throw new Error(
      `${params.key} is not a known engenty variable. Check \`engenty env check\` for the spelling, or pass --force to write it anyway.`
    );
  }
  if (spec && !spec.scopes.includes(manifestScope(params.scope))) {
    throw new Error(
      `${params.key} does not belong in the ${params.scope} scope (it is used in: ${spec.scopes.join(", ")}).`
    );
  }

  const problem = spec?.validate?.(params.value);
  if (problem) {
    throw new Error(`${params.key}: ${problem}`);
  }

  const doc =
    loadScopeDocument(params.workspaceRoot, params.scope) ??
    parseEnvDocument("");
  if (isPortlessOwned(doc, params.key)) {
    throw new Error(
      `${params.key} is written by the portless dev-URL sync, so a value set here would be overwritten. Change it in that block or stop syncing.`
    );
  }
  setValue(doc, params.key, params.value);
  saveScopeDocument(params.workspaceRoot, params.scope, doc);

  const shown = spec?.secret ? maskSecret(params.value) : params.value;
  if (!spec) {
    console.log(
      dim(
        `${params.key} is not in this package's env manifest — written as given.`
      )
    );
  }
  console.log(
    `${green("✓")} ${params.key}=${shown} ${dim(`→ ${envFilePath(params.workspaceRoot, params.scope)}`)}`
  );
  return 0;
}
