import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aiAgentManifestSchema } from "./agent-manifest.js";
import { agentStarterSchema } from "./agent-starters.js";

/**
 * Agents that are specialists by `resolveAgentRole` but may ship without
 * catalogue chips. Keep this explicit — an empty set means every specialist
 * must declare at least two starters.
 */
const STARTER_EXEMPT_SPECIALIST_IDS = new Set<string>([]);

function isSpecialistAgentId(id: string): boolean {
  if (id === "engenty.copilot") {
    return false;
  }
  if (id.startsWith("chatbot.")) {
    return false;
  }
  if (id.endsWith(".answers")) {
    return false;
  }
  return true;
}

function listAgentDirs(): string[] {
  const modulesRoot = join(process.cwd(), "modules");
  const dirs: string[] = [];
  for (const moduleEntry of readdirSync(modulesRoot, { withFileTypes: true })) {
    if (!moduleEntry.isDirectory()) {
      continue;
    }
    const agentsDir = join(modulesRoot, moduleEntry.name, "ai", "agents");
    try {
      for (const agentEntry of readdirSync(agentsDir, {
        withFileTypes: true,
      })) {
        if (!agentEntry.isDirectory()) {
          continue;
        }
        dirs.push(join(agentsDir, agentEntry.name));
      }
    } catch {
      // Module has no ai/agents directory.
    }
  }
  return dirs.toSorted();
}

describe("shipped agent starter catalogue", () => {
  const agentDirs = listAgentDirs();
  const manifests = agentDirs.map((dir) => {
    const path = join(dir, "agent.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      unknown
    >;
    return { path, manifest: aiAgentManifestSchema.parse(raw) };
  });

  // What this guards: the walk resolves `modules/` from the cwd and swallows a
  // missing ai/agents directory, so a wrong cwd yields an empty list and the
  // two tests below then pass over nothing. It is not an inventory — the
  // installed module set differs per tree (the open snapshot ships four agents
  // fewer, its closed modules filtered out), and the count this used to assert
  // described only the tree it was written in, so the mirror failed here on
  // every release.
  it("finds the agent directories shipped by the installed modules", () => {
    expect(agentDirs).not.toEqual([]);
  });

  it("requires specialists to declare at least two starters", () => {
    const missing: string[] = [];
    for (const { manifest } of manifests) {
      if (!isSpecialistAgentId(manifest.id)) {
        continue;
      }
      if (STARTER_EXEMPT_SPECIALIST_IDS.has(manifest.id)) {
        continue;
      }
      if ((manifest.starters ?? []).length < 2) {
        missing.push(manifest.id);
      }
    }
    expect(missing).toEqual([]);
  });

  it("ships German overrides and keeps chip labels short", () => {
    for (const { manifest } of manifests) {
      for (const starter of manifest.starters ?? []) {
        const parsed = agentStarterSchema.parse(starter);
        expect(
          parsed.label.length,
          `${manifest.id}:${parsed.id} label`
        ).toBeLessThanOrEqual(40);
        expect(
          parsed.locales?.de?.label,
          `${manifest.id}:${parsed.id} missing locales.de`
        ).toBeTruthy();
        expect(
          parsed.locales?.de?.label.length ?? 0,
          `${manifest.id}:${parsed.id} de label`
        ).toBeLessThanOrEqual(40);
      }
    }
  });
});
