import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  password,
  spinner,
  text,
} from "@clack/prompts";
import { resolveSupabaseCliBin } from "../db/supabase-cli-bin.js";
import { renderScopeReport } from "./env-check.js";
import {
  diffScope,
  generatableGaps,
  requiredGaps,
  type ScopeReport,
} from "./env-diff.js";
import { renderExampleFile } from "./env-example-render.js";
import {
  type EnvDocument,
  hasPortlessBlock,
  setValue,
} from "./env-file-document.js";
import {
  envFilePath,
  loadScopeDocument,
  maskSecret,
  resolveWorkspaceRoot,
  saveScopeDocument,
} from "./env-files.js";
import { generateSecretValue } from "./env-generate.js";
import {
  ENV_SCOPES,
  getEnvFeatures,
  manifestForScope,
} from "./env-manifest.js";
import type { EnvScope, EnvVarSpec } from "./env-manifest-types.js";
import { defaultValueForScope } from "./env-manifest-types.js";
import {
  type CommandRunner,
  harvestSupabaseStatus,
  resolveSupabaseValue,
} from "./env-supabase.js";

const CANCELLED = Symbol("cancelled");

interface WizardState {
  docs: Map<EnvScope, EnvDocument>;
  features: Set<string>;
  scopes: EnvScope[];
  workspaceRoot: string;
}

function specsFor(state: WizardState): { scope: EnvScope; spec: EnvVarSpec }[] {
  return state.scopes.flatMap((scope) =>
    manifestForScope(scope).map((spec) => ({ scope, spec }))
  );
}

function isActive(state: WizardState, spec: EnvVarSpec): boolean {
  if (!spec.feature) {
    return true;
  }
  return state.features.has(spec.feature);
}

function currentValue(state: WizardState, scope: EnvScope, key: string) {
  const doc = state.docs.get(scope);
  if (!doc) {
    return;
  }
  for (let i = doc.lines.length - 1; i >= 0; i--) {
    const line = doc.lines[i];
    if (line.type === "entry" && line.key === key) {
      return line.value;
    }
  }
  return;
}

function scopeReportFromState(
  state: WizardState,
  scope: EnvScope
): ScopeReport {
  return diffScope({
    doc: state.docs.get(scope) ?? null,
    scope,
    specs: manifestForScope(scope),
  });
}

function needsValue(state: WizardState, scope: EnvScope, spec: EnvVarSpec) {
  const entry = scopeReportFromState(state, scope).vars.find(
    (v) => v.spec.key === spec.key
  );
  return entry ? entry.status !== "ok" : true;
}

function ensureScopeFiles(state: WizardState): string[] {
  const created: string[] = [];
  for (const scope of state.scopes) {
    const filePath = envFilePath(state.workspaceRoot, scope);
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, renderExampleFile(scope), "utf8");
      created.push(ENV_SCOPES[scope].envFile);
    }
    const doc = loadScopeDocument(state.workspaceRoot, scope);
    if (doc) {
      state.docs.set(scope, doc);
    }
  }
  return created;
}

function reloadDocs(state: WizardState): void {
  for (const scope of state.scopes) {
    const doc = loadScopeDocument(state.workspaceRoot, scope);
    if (doc) {
      state.docs.set(scope, doc);
    }
  }
}

function saveDocs(state: WizardState): void {
  for (const [scope, doc] of state.docs) {
    saveScopeDocument(state.workspaceRoot, scope, doc);
  }
}

async function selectFeatures(
  state: WizardState
): Promise<typeof CANCELLED | undefined> {
  const features = getEnvFeatures();
  const preselected = features
    .filter(
      (feature) =>
        // Recommended features (e.g. the AI copilot) start checked on a fresh
        // setup; anything already configured stays checked too.
        feature.recommended === true ||
        specsFor(state).some(
          ({ scope, spec }) =>
            spec.feature === feature.id &&
            (currentValue(state, scope, spec.key)?.trim() ?? "") !== ""
        )
    )
    .map((feature) => feature.id);

  const picked = await multiselect({
    initialValues: preselected,
    message:
      "Which optional features do you want to configure? (space to toggle)",
    options: features.map((feature) => ({
      hint: feature.description,
      label: feature.label,
      value: feature.id,
    })),
    required: false,
  });
  if (isCancel(picked)) {
    return CANCELLED;
  }
  state.features = new Set(picked);
  return;
}

async function generateSecrets(
  state: WizardState
): Promise<typeof CANCELLED | undefined> {
  const gaps: { scope: EnvScope; spec: EnvVarSpec }[] = [];
  for (const scope of state.scopes) {
    const report = scopeReportFromState(state, scope);
    for (const entry of generatableGaps(report)) {
      if (isActive(state, entry.spec)) {
        gaps.push({ scope, spec: entry.spec });
      }
    }
  }
  if (gaps.length === 0) {
    return;
  }

  const keys = [...new Set(gaps.map((gap) => gap.spec.key))].join(", ");
  const go = await confirm({
    initialValue: true,
    message: `Generate missing secrets locally (${keys})?`,
  });
  if (isCancel(go)) {
    return CANCELLED;
  }
  if (!go) {
    return;
  }

  // Reuse one value per key so root and deploy stay consistent within a run.
  const generated = new Map<string, string>();
  for (const gap of gaps) {
    if (gap.spec.obtain.kind !== "generate") {
      continue;
    }
    const value =
      generated.get(gap.spec.key) ??
      generateSecretValue(gap.spec.obtain.generator);
    generated.set(gap.spec.key, value);
    const doc = state.docs.get(gap.scope);
    if (doc) {
      setValue(doc, gap.spec.key, value, {
        commentLines: [gap.spec.description],
      });
    }
  }
  saveDocs(state);
  note(`Generated: ${keys}`, "Secrets");
  return;
}

async function harvestSupabase(
  state: WizardState
): Promise<typeof CANCELLED | undefined> {
  const targets = specsFor(state).filter(
    ({ scope, spec }) =>
      spec.obtain.kind === "supabase" &&
      isActive(state, spec) &&
      needsValue(state, scope, spec)
  );
  if (targets.length === 0) {
    return;
  }

  const spin = spinner();
  spin.start("Reading local Supabase credentials (supabase status)…");
  // Run supabase from the workspace root via spawnSync — same invocation the
  // db/setup commands use — to avoid PATH/cwd differences when the CLI runs
  // under `pnpm exec` from apps/core.
  const supabaseBin = resolveSupabaseCliBin(state.workspaceRoot);
  const runner: CommandRunner = (command, args) => {
    const bin = command === "supabase" ? supabaseBin : command;
    const result = spawnSync(bin, [...args], {
      cwd: state.workspaceRoot,
      encoding: "utf8",
      timeout: 30_000,
    });
    return Promise.resolve({
      code: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? result.error?.message ?? "",
    });
  };
  const harvest = await harvestSupabaseStatus(runner);
  if (!harvest.ok) {
    spin.stop("Supabase stack not reachable.");
    note(
      `${harvest.error ?? "supabase status failed."}\nStart it with: pnpm engenty db up — then rerun pnpm engenty env init`,
      "Supabase"
    );
    return;
  }
  spin.stop("Supabase credentials read.");

  const resolved: { scope: EnvScope; spec: EnvVarSpec; value: string }[] = [];
  for (const target of targets) {
    if (target.spec.obtain.kind !== "supabase") {
      continue;
    }
    const value = resolveSupabaseValue(
      target.spec.obtain.statusKeys,
      harvest.values,
      // `supabase status` is always the local CLI stack, whose PostgREST only
      // validates legacy HS256 JWTs — prefer those over the new sb_* keys.
      { preferJwt: true }
    );
    if (value) {
      resolved.push({ ...target, value });
    }
  }
  if (resolved.length === 0) {
    return;
  }

  const preview = resolved
    .map(
      ({ scope, spec, value }) =>
        `${spec.key} (${scope}) = ${spec.secret ? maskSecret(value) : value}`
    )
    .join("\n");
  const go = await confirm({
    initialValue: true,
    message: `Write these Supabase values?\n${preview}`,
  });
  if (isCancel(go)) {
    return CANCELLED;
  }
  if (!go) {
    return;
  }
  for (const { scope, spec, value } of resolved) {
    const doc = state.docs.get(scope);
    if (doc) {
      setValue(doc, spec.key, value, { commentLines: [spec.description] });
    }
  }
  saveDocs(state);
  return;
}

/** Write manifest `defaultValue` for optional, non-secret vars that are still unset. */
function applyManifestDefaults(state: WizardState): void {
  const applied: string[] = [];
  for (const { scope, spec } of specsFor(state)) {
    if (!spec.defaultValue || spec.secret || !isActive(state, spec)) {
      continue;
    }
    if ((currentValue(state, scope, spec.key)?.trim() ?? "") !== "") {
      continue;
    }
    const value = defaultValueForScope(spec, scope);
    if (!value) {
      continue;
    }
    const doc = state.docs.get(scope);
    if (!doc) {
      continue;
    }
    setValue(doc, spec.key, value, { commentLines: [spec.description] });
    applied.push(`${spec.key}=${value} (${ENV_SCOPES[scope].envFile})`);
  }
  if (applied.length === 0) {
    return;
  }
  saveDocs(state);
  note(applied.join("\n"), "Applied defaults");
}

async function applyManifestDefaultsStep(
  state: WizardState
): Promise<undefined> {
  applyManifestDefaults(state);
}

async function syncPortless(
  state: WizardState
): Promise<typeof CANCELLED | undefined> {
  if (!state.scopes.includes("root")) {
    return;
  }
  const rootDoc = state.docs.get("root");
  if (!rootDoc || hasPortlessBlock(rootDoc)) {
    return;
  }
  const go = await confirm({
    initialValue: false,
    message:
      "Optional: run pnpm portless:setup (HTTPS *.localhost URLs + .env.local sync)?",
  });
  if (isCancel(go)) {
    return CANCELLED;
  }
  if (!go) {
    saveDocs(state);
    const localhost = spawnSync(
      "node",
      ["scripts/sync-dev-env-localhost.mjs"],
      {
        cwd: state.workspaceRoot,
        encoding: "utf8",
        stdio: "pipe",
      }
    );
    if (localhost.status === 0) {
      note(
        (localhost.stdout || "").trim() ||
          "Wrote localhost dev URLs to .env.local (open http://localhost:5173 after pnpm dev).",
        "Dev URLs"
      );
    } else {
      note(
        `${(localhost.stderr || localhost.stdout).trim()}\nRun: pnpm dev:urls:localhost`,
        "Dev URLs sync failed"
      );
    }
    reloadDocs(state);
    return;
  }
  saveDocs(state);
  const result = spawnSync("pnpm", ["portless:setup"], {
    cwd: state.workspaceRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status === 0) {
    note(
      (result.stdout || "").trim() || "Portless setup complete.",
      "Portless"
    );
  } else {
    note(
      `${(result.stderr || result.stdout).trim()}\nSee docs/dev/portless-local-urls.md — or run pnpm dev:urls:localhost for http://localhost:5173.`,
      "Portless setup failed"
    );
  }
  reloadDocs(state);
  return;
}

async function promptProviderVars(
  state: WizardState
): Promise<typeof CANCELLED | undefined> {
  const pending = specsFor(state).filter(
    ({ scope, spec }) =>
      (spec.obtain.kind === "provider" || spec.obtain.kind === "manual") &&
      spec.feature !== undefined &&
      isActive(state, spec) &&
      needsValue(state, scope, spec)
  );

  for (const { scope, spec } of pending) {
    const obtain = spec.obtain;
    const instructionLines =
      obtain.kind === "provider" || obtain.kind === "manual"
        ? (obtain.instructions ?? [])
        : [];
    const noteLines = [spec.description, "", ...instructionLines];
    if (obtain.kind === "provider") {
      // Show the URL (clickable in most terminals) rather than prompting to
      // open a browser.
      noteLines.push("", obtain.url);
    }
    if (noteLines.some((line) => line.trim() !== "")) {
      note(noteLines.join("\n"), spec.key);
    }

    const promptMessage = `${spec.key} (${ENV_SCOPES[scope].envFile}) — leave empty to skip`;
    const answer = spec.secret
      ? await password({ message: promptMessage })
      : await text({
          initialValue:
            currentValue(state, scope, spec.key) ??
            defaultValueForScope(spec, scope) ??
            "",
          message: promptMessage,
        });
    if (isCancel(answer)) {
      return CANCELLED;
    }
    const value = (answer ?? "").trim();
    if (value === "") {
      continue;
    }
    const error = spec.validate?.(value);
    if (error) {
      note(
        `${error} — skipped ${spec.key}; set it later via: engenty env edit ${spec.key}`,
        "Invalid value"
      );
      continue;
    }
    const doc = state.docs.get(scope);
    if (doc) {
      setValue(doc, spec.key, value, { commentLines: [spec.description] });
    }
  }
  saveDocs(state);
  return;
}

function finalReport(state: WizardState): { gaps: number; text: string } {
  const sections: string[] = [];
  let gaps = 0;
  for (const scope of state.scopes) {
    const report = scopeReportFromState(state, scope);
    gaps += requiredGaps(report).length;
    sections.push(renderScopeReport(state.workspaceRoot, report));
  }
  return { gaps, text: sections.join("\n\n") };
}

export async function runEnvInitWizard(
  requestedScopes: EnvScope[]
): Promise<number> {
  const scopes = requestedScopes.filter((scope) => scope !== "deploy");
  if (requestedScopes.includes("deploy")) {
    console.log(
      "The deploy/.env wizard is not implemented yet (docs/dev/wip/setup/phase-05-production-deploy.md).\n" +
        "Use deploy/DEPLOY.md + deploy/.env.example for now; `engenty env check --scope deploy` already works."
    );
    if (scopes.length === 0) {
      return 0;
    }
  }

  intro("Engenty environment setup");
  const state: WizardState = {
    docs: new Map(),
    features: new Set(),
    scopes,
    workspaceRoot: resolveWorkspaceRoot(),
  };

  const created = ensureScopeFiles(state);
  if (created.length > 0) {
    note(created.join("\n"), "Created env files");
  }

  const steps = [
    selectFeatures,
    applyManifestDefaultsStep,
    generateSecrets,
    harvestSupabase,
    syncPortless,
    promptProviderVars,
  ];
  for (const step of steps) {
    if ((await step(state)) === CANCELLED) {
      cancel("Cancelled.");
      return 1;
    }
  }

  const { gaps, text: reportText } = finalReport(state);
  console.log(`\n${reportText}\n`);
  if (gaps > 0) {
    outro(
      `${gaps} required value(s) still missing — rerun pnpm engenty env init anytime, or set single keys via engenty env edit <KEY>.`
    );
  } else {
    outro(
      "Environment ready. Next: pnpm engenty db up (if not running), pnpm dev — open http://localhost:5173 (or pnpm portless:setup for https://engenty.localhost)"
    );
  }
  return 0;
}

/** Used by `engenty env generate`. */
export async function runEnvGenerate(force: boolean): Promise<number> {
  const workspaceRoot = resolveWorkspaceRoot();
  const scopes: EnvScope[] = (["root", "deploy"] as const).filter(
    (scope) => loadScopeDocument(workspaceRoot, scope) !== null
  );
  if (scopes.length === 0) {
    console.error("No env files found. Run: pnpm engenty env init");
    return 1;
  }

  const docs = new Map<EnvScope, EnvDocument>();
  for (const scope of scopes) {
    const doc = loadScopeDocument(workspaceRoot, scope);
    if (doc) {
      docs.set(scope, doc);
    }
  }

  const targets: { scope: EnvScope; spec: EnvVarSpec }[] = [];
  for (const scope of scopes) {
    const report = diffScope({
      doc: docs.get(scope) ?? null,
      scope,
      specs: manifestForScope(scope),
    });
    for (const entry of report.vars) {
      if (entry.spec.obtain.kind !== "generate") {
        continue;
      }
      if (force || entry.status !== "ok") {
        targets.push({ scope, spec: entry.spec });
      }
    }
  }
  if (targets.length === 0) {
    console.log(
      "All generatable secrets are already set. Use --force to rotate."
    );
    return 0;
  }

  if (force) {
    intro("Rotate generated secrets");
    const go = await confirm({
      initialValue: false,
      message:
        "Rotating invalidates derived data: a new INBOX_TOKEN_ENC_KEY makes stored inbox OAuth tokens unreadable; a new ENGENTY_SECURITY_JWT_SECRET invalidates issued device/CLI/service tokens. Continue?",
    });
    if (isCancel(go) || !go) {
      cancel("Cancelled.");
      return 1;
    }
  }

  const generated = new Map<string, string>();
  for (const { scope, spec } of targets) {
    if (spec.obtain.kind !== "generate") {
      continue;
    }
    const value =
      generated.get(spec.key) ?? generateSecretValue(spec.obtain.generator);
    generated.set(spec.key, value);
    const doc = docs.get(scope);
    if (doc) {
      setValue(doc, spec.key, value, { commentLines: [spec.description] });
    }
  }
  for (const [scope, doc] of docs) {
    saveScopeDocument(workspaceRoot, scope, doc);
  }
  console.log(
    `Generated: ${[...generated.keys()].join(", ")} (${targets.length} file entr${targets.length === 1 ? "y" : "ies"})`
  );
  return 0;
}
