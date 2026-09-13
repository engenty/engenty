import {
  type EnvVarSpec,
  getEnvManifest,
  NON_CONFIGURABLE_ENV_KEYS,
  type ObtainStrategy,
} from "@engenty/cli";
import type { SettingSpec, SettingValueType } from "@engenty/platform-settings";

/**
 * A configurable env var, projected for the settings store + Setup UI. Extends
 * the resolver's {@link SettingSpec} with the presentational manifest metadata
 * the UI renders (group, description, how to obtain the value).
 */
export interface ConfigurableSetting extends SettingSpec {
  description: string;
  feature?: string;
  group: string;
  obtain: ObtainStrategy;
  required: EnvVarSpec["required"];
  /** Server-side validator; never serialized to the client. */
  validate?: (value: string) => string | undefined;
}

function settingType(spec: EnvVarSpec): SettingValueType {
  if (spec.secret) {
    return "secret";
  }
  const dv = typeof spec.defaultValue === "string" ? spec.defaultValue : "";
  if (dv === "true" || dv === "false") {
    return "boolean";
  }
  return "string";
}

let cache: ConfigurableSetting[] | null = null;

/**
 * The configurable subset of the env manifest. Memoized — manifests are static
 * for the process lifetime. Re-asserts the denylist for CORE manifest entries
 * (the contribution loader already guards module-contributed vars).
 */
export function getConfigurableSettings(): ConfigurableSetting[] {
  if (cache) {
    return cache;
  }
  const out: ConfigurableSetting[] = [];
  for (const spec of getEnvManifest()) {
    if (!spec.configurable) {
      continue;
    }
    if (NON_CONFIGURABLE_ENV_KEYS.includes(spec.key)) {
      throw new Error(
        `${spec.key} is on NON_CONFIGURABLE_ENV_KEYS and cannot be made DB-configurable`
      );
    }
    out.push({
      key: spec.key,
      configurable: spec.configurable,
      secret: spec.secret,
      type: settingType(spec),
      defaultValue:
        typeof spec.defaultValue === "string" ? spec.defaultValue : undefined,
      group: spec.group,
      description: spec.description,
      obtain: spec.obtain,
      required: spec.required,
      feature: spec.feature,
      validate: spec.validate,
    });
  }
  cache = out;
  return out;
}

/** The plain resolver specs (no presentational fields) for createSettingsResolver. */
export function getSettingSpecs(): SettingSpec[] {
  return getConfigurableSettings().map((s) => ({
    key: s.key,
    configurable: s.configurable,
    secret: s.secret,
    type: s.type,
    defaultValue: s.defaultValue,
  }));
}
