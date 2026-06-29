import fs from "node:fs";
import path from "node:path";

export interface PluginStateSnapshot {
  plugins: Record<string, { enabled: boolean; updatedAt: string }>;
  version: 1;
}

const DEFAULT_STATE: PluginStateSnapshot = {
  version: 1,
  plugins: {},
};

export function resolvePluginStatePath(dataDir: string) {
  return path.resolve(dataDir, "plugin-state.json");
}

export function readPluginState(statePath: string): PluginStateSnapshot {
  if (!fs.existsSync(statePath)) {
    return DEFAULT_STATE;
  }
  try {
    const parsed = JSON.parse(
      fs.readFileSync(statePath, "utf-8")
    ) as Partial<PluginStateSnapshot>;
    if (
      parsed.version !== 1 ||
      typeof parsed.plugins !== "object" ||
      parsed.plugins === null
    ) {
      return DEFAULT_STATE;
    }

    const normalized: PluginStateSnapshot["plugins"] = {};
    for (const [pluginId, raw] of Object.entries(parsed.plugins)) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const enabled = (raw as { enabled?: unknown }).enabled;
      const updatedAt = (raw as { updatedAt?: unknown }).updatedAt;
      if (typeof enabled !== "boolean") {
        continue;
      }
      normalized[pluginId] = {
        enabled,
        updatedAt:
          typeof updatedAt === "string" ? updatedAt : new Date(0).toISOString(),
      };
    }
    return { version: 1, plugins: normalized };
  } catch {
    return DEFAULT_STATE;
  }
}

export function writePluginState(
  statePath: string,
  snapshot: PluginStateSnapshot
) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(
    statePath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf-8"
  );
}

export function setPluginEnabledState(
  statePath: string,
  pluginId: string,
  enabled: boolean
): PluginStateSnapshot {
  const current = readPluginState(statePath);
  const next: PluginStateSnapshot = {
    version: 1,
    plugins: {
      ...current.plugins,
      [pluginId]: {
        enabled,
        updatedAt: new Date().toISOString(),
      },
    },
  };
  writePluginState(statePath, next);
  return next;
}
