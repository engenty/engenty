import {
  cancel,
  intro,
  isCancel,
  note,
  outro,
  password,
  select,
  text,
} from "@clack/prompts";
import { getValue, isPortlessOwned, setValue } from "./env-file-document.js";
import {
  loadScopeDocument,
  maskSecret,
  resolveWorkspaceRoot,
  saveScopeDocument,
} from "./env-files.js";
import { ENV_SCOPES, findSpec, getEnvManifest } from "./env-manifest.js";
import type { EnvScope, EnvVarSpec } from "./env-manifest-types.js";
import { dim, green } from "./env-style.js";

function displayCurrentValue(
  spec: EnvVarSpec,
  value: string | undefined
): string {
  if (value === undefined || value.trim() === "") {
    return "unset";
  }
  if (spec.secret) {
    return maskSecret(value);
  }
  return value.length > 32 ? `${value.slice(0, 29)}…` : value;
}

async function pickKey(
  workspaceRoot: string
): Promise<EnvVarSpec | "cancelled"> {
  const docs = new Map(
    (["root", "deploy"] as const).map((scope) => [
      scope,
      loadScopeDocument(workspaceRoot, scope),
    ])
  );
  const valueFor = (spec: EnvVarSpec): string | undefined => {
    for (const scope of spec.scopes) {
      const doc = docs.get(scope);
      if (!doc) {
        continue;
      }
      const value = getValue(doc, spec.key);
      if (value !== undefined && value.trim() !== "") {
        return value;
      }
    }
    return;
  };

  const editable = getEnvManifest().filter(
    (spec) => spec.obtain.kind !== "portless"
  );
  const keyWidth = Math.max(...editable.map((spec) => spec.key.length));
  const picked = await select({
    message: "Which variable do you want to edit?",
    options: editable.map((spec) => {
      const current = displayCurrentValue(spec, valueFor(spec));
      return {
        hint: spec.group,
        label: `${spec.key.padEnd(keyWidth)}  ${current === "unset" ? dim("· unset") : green(current)}`,
        value: spec.key,
      };
    }),
  });
  if (isCancel(picked)) {
    return "cancelled";
  }
  const spec = findSpec(picked);
  return spec ?? "cancelled";
}

async function pickScope(spec: EnvVarSpec): Promise<EnvScope | "cancelled"> {
  if (spec.scopes.length === 1) {
    return spec.scopes[0];
  }
  const picked = await select({
    initialValue: spec.scopes[0],
    message: `${spec.key} lives in several files — which one?`,
    options: spec.scopes.map((scope) => ({
      label: ENV_SCOPES[scope].envFile,
      value: scope,
    })),
  });
  return isCancel(picked) ? "cancelled" : picked;
}

export async function runEnvEdit(key?: string): Promise<number> {
  intro("Edit environment variable");
  const workspaceRoot = resolveWorkspaceRoot();

  let spec: EnvVarSpec | undefined;
  if (key) {
    spec = findSpec(key);
    if (!spec) {
      const close = getEnvManifest()
        .filter((entry) => entry.key.includes(key.toUpperCase()))
        .map((entry) => entry.key)
        .slice(0, 5);
      cancel(
        `Unknown key: ${key}${close.length > 0 ? ` — did you mean: ${close.join(", ")}?` : ""}`
      );
      return 1;
    }
  } else {
    const picked = await pickKey(workspaceRoot);
    if (picked === "cancelled") {
      cancel("Cancelled.");
      return 1;
    }
    spec = picked;
  }

  if (spec.obtain.kind === "portless") {
    cancel(
      `${spec.key} is managed by the dev URL block — run pnpm dev:urls:localhost or pnpm dev:urls:portless instead.`
    );
    return 1;
  }

  const scope = await pickScope(spec);
  if (scope === "cancelled") {
    cancel("Cancelled.");
    return 1;
  }

  const doc = loadScopeDocument(workspaceRoot, scope);
  if (!doc) {
    cancel(
      `${ENV_SCOPES[scope].envFile} does not exist yet. Run: pnpm dev:env:init`
    );
    return 1;
  }
  if (isPortlessOwned(doc, spec.key)) {
    cancel(
      `${spec.key} is managed by the dev URL block — run pnpm dev:urls:localhost or pnpm dev:urls:portless instead.`
    );
    return 1;
  }

  const current = getValue(doc, spec.key);
  if (current && spec.secret) {
    note(`Current value: ${maskSecret(current)}`, spec.key);
  }
  const message = `${spec.key} (${ENV_SCOPES[scope].envFile})`;
  const answer = spec.secret
    ? await password({
        message,
        validate: (value) => (value ? spec.validate?.(value) : undefined),
      })
    : await text({
        initialValue: current ?? "",
        message,
        validate: (value) => (value ? spec.validate?.(value) : undefined),
      });
  if (isCancel(answer)) {
    cancel("Cancelled.");
    return 1;
  }
  const value = (answer ?? "").trim();
  if (value === "") {
    cancel("Empty value — nothing written.");
    return 1;
  }

  setValue(doc, spec.key, value, { commentLines: [spec.description] });
  saveScopeDocument(workspaceRoot, scope, doc);
  outro(`Updated ${spec.key} in ${ENV_SCOPES[scope].envFile}`);
  return 0;
}
