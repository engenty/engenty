import {
  documentEntries,
  type EnvDocument,
  isPortlessOwned,
} from "./env-file-document.js";
import type { EnvScope, EnvVarSpec } from "./env-manifest-types.js";

export type EnvVarStatus =
  | "ok"
  | "missing"
  | "empty"
  | "placeholder"
  | "invalid";

export interface EnvVarReport {
  error?: string;
  portlessOwned: boolean;
  spec: EnvVarSpec;
  status: EnvVarStatus;
  value?: string;
}

export interface ScopeReport {
  /** Keys present in the file but unknown to the manifest (warn-only, never deleted). */
  extras: string[];
  fileExists: boolean;
  scope: EnvScope;
  vars: EnvVarReport[];
}

function statusFor(
  spec: EnvVarSpec,
  value: string | undefined
): Pick<EnvVarReport, "error" | "status"> {
  if (value === undefined) {
    return { status: "missing" };
  }
  if (value.trim() === "") {
    return { status: "empty" };
  }
  if (spec.exampleValue !== undefined && value === spec.exampleValue) {
    return { status: "placeholder" };
  }
  const error = spec.validate?.(value);
  if (error) {
    return { error, status: "invalid" };
  }
  return { status: "ok" };
}

export interface DiffScopeParams {
  /** null when the env file does not exist yet. */
  doc: EnvDocument | null;
  scope: EnvScope;
  specs: readonly EnvVarSpec[];
}

export function diffScope(params: DiffScopeParams): ScopeReport {
  const entries = params.doc ? documentEntries(params.doc) : new Map();
  const vars: EnvVarReport[] = params.specs.map((spec) => {
    const value = entries.get(spec.key);
    return {
      ...statusFor(spec, value),
      portlessOwned: params.doc ? isPortlessOwned(params.doc, spec.key) : false,
      spec,
      value,
    };
  });

  const known = new Set(params.specs.map((spec) => spec.key));
  const extras = [...entries.keys()].filter((key) => !known.has(key));

  return {
    extras,
    fileExists: params.doc !== null,
    scope: params.scope,
    vars,
  };
}

/** Vars that block a green check: required-always and not ok (portless-owned excluded). */
export function requiredGaps(report: ScopeReport): EnvVarReport[] {
  return report.vars.filter(
    (entry) =>
      entry.spec.required === "always" &&
      entry.status !== "ok" &&
      !entry.portlessOwned &&
      entry.spec.obtain.kind !== "portless"
  );
}

/** Generate-kind vars that are currently unset/unusable. */
export function generatableGaps(report: ScopeReport): EnvVarReport[] {
  return report.vars.filter(
    (entry) => entry.spec.obtain.kind === "generate" && entry.status !== "ok"
  );
}
