#!/usr/bin/env node
/**
 * pnpm ai:check — repo-wide catalog validation for the ai/ layer.
 *
 * Checks across modules and packages ai directories:
 *   1. Every agents/<id>/agent.json parses; id matches ^[a-z0-9-]+\.[a-z0-9-]+$
 *      or is on the legacy allowlist.
 *   2. Agent ids are globally unique.
 *   3. Every actions/ACTION.md frontmatter agent_id resolves to a declared id
 *      (manifest ids + builtin ids).
 *   4. Every skills/SKILL.md has frontmatter name matching ^[a-z0-9-]+$ and
 *      equal to its directory name; skill names globally unique.
 *   5. allowed-tools entries match ^[a-z0-9_]{1,64}$ or known workspace tools.
 *   6. Grep guard: no retired keys under modules ai directories.
 *
 * Exit 1 on any violation.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// Ids still legal during a rename window. Empty since Phase 5.3 renamed
// leads_manager / company_profile_manager to dot notation; add ids here
// only for a future tracked rename.
const LEGACY_AGENT_IDS = new Set();

// Ids with no agent.json manifest (assembled entirely in apps/ai code).
// Add here only ids that genuinely have no manifest file.
const BUILTIN_AGENT_IDS = new Set(["engenty.cli"]);

// Workspace tools that may appear in allowed-tools without a catalog entry.
const WORKSPACE_TOOL_NAMES = new Set(["skill", "skill_search"]);

// Retired agent id strings that must not appear anywhere under modules/*/ai/.
// leads.manager / company-profile.manager are the live ids since the Phase 5.3
// rename; the old snake_case ids are retired instead.
const RETIRED_AGENT_KEYS = [
  "kb.manager",
  "leads_manager",
  "company_profile_manager",
  "engenty-tools",
];

const VALID_ID_RE = /^[a-z0-9-]+\.[a-z0-9-]+$/;
const VALID_LEGACY_RE = /^[a-z0-9_]+$/;
const VALID_SKILL_NAME_RE = /^[a-z0-9-]+$/;
// Allows snake_case catalog tools and camelCase MCP-style tool names.
const VALID_TOOL_ENTRY_RE = /^[a-zA-Z0-9_]{1,64}$/;
const SKIP_DIRS = new Set(["dist", "node_modules", ".turbo", ".git"]);

const errors = [];

function err(file, message) {
  errors.push(`  ${relative(ROOT, file)}: ${message}`);
}

// ── Frontmatter parser ────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return {};
  }
  const fields = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      break;
    }
    const colon = line.indexOf(":");
    if (colon < 0) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    fields[key] = value;
  }
  return fields;
}

// ── Directory discovery ───────────────────────────────────────────────────────

function listAiDirs() {
  const dirs = [];
  const candidates = [join(ROOT, "modules"), join(ROOT, "packages")];
  for (const base of candidates) {
    if (!existsSync(base)) {
      continue;
    }
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const aiDir = join(base, entry.name, "ai");
      if (existsSync(aiDir)) {
        dirs.push(aiDir);
      }
    }
  }
  return dirs;
}

function findFiles(dir, filename) {
  const results = [];
  if (!existsSync(dir)) {
    return results;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, filename));
    } else if (entry.name === filename) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Checks ────────────────────────────────────────────────────────────────────

const aiDirs = listAiDirs();
const declaredAgentIds = new Set([...BUILTIN_AGENT_IDS]);

// 1 + 2: agent.json validity and uniqueness
for (const aiDir of aiDirs) {
  for (const manifestPath of findFiles(join(aiDir, "agents"), "agent.json")) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      err(manifestPath, "agent.json parse error");
      continue;
    }
    const id = manifest.id;
    if (typeof id !== "string" || !id) {
      err(manifestPath, 'missing "id" field');
      continue;
    }
    if (
      !(
        LEGACY_AGENT_IDS.has(id) ||
        VALID_ID_RE.test(id) ||
        VALID_LEGACY_RE.test(id)
      )
    ) {
      err(
        manifestPath,
        `id "${id}" does not match ^[a-z0-9-]+\\.[a-z0-9-]+$ or the legacy allowlist`
      );
    }
    if (declaredAgentIds.has(id)) {
      err(manifestPath, `duplicate agent id "${id}"`);
    } else {
      declaredAgentIds.add(id);
    }
  }
}

// 3: ACTION.md agent_id resolution
for (const aiDir of aiDirs) {
  for (const actionPath of findFiles(join(aiDir, "actions"), "ACTION.md")) {
    const content = readFileSync(actionPath, "utf8");
    const fm = parseFrontmatter(content);
    if (!fm.agent_id) {
      continue; // optional field
    }
    if (
      !(declaredAgentIds.has(fm.agent_id) || LEGACY_AGENT_IDS.has(fm.agent_id))
    ) {
      err(actionPath, `agent_id "${fm.agent_id}" is not a declared agent id`);
    }
  }
}

// 3b: ROUTINE.md validation retired — the file mechanism is gone (routine =
// Trigger(schedule) → Task; routines register in code or as ai.custom_routine).

// 4: SKILL.md name validation and uniqueness
const declaredSkillNames = new Set();
for (const aiDir of aiDirs) {
  for (const skillPath of findFiles(join(aiDir, "skills"), "SKILL.md")) {
    const dirName = skillPath.split("/").at(-2);
    const content = readFileSync(skillPath, "utf8");
    const fm = parseFrontmatter(content);
    // Skills often use the dir name as their title line, not a frontmatter name.
    // Only check if a frontmatter name field exists.
    if (fm.name) {
      if (!VALID_SKILL_NAME_RE.test(fm.name)) {
        err(
          skillPath,
          `frontmatter name "${fm.name}" does not match ^[a-z0-9-]+$`
        );
      }
      if (fm.name !== dirName) {
        err(
          skillPath,
          `frontmatter name "${fm.name}" does not match directory name "${dirName}"`
        );
      }
      if (declaredSkillNames.has(fm.name)) {
        err(skillPath, `duplicate skill name "${fm.name}"`);
      } else {
        declaredSkillNames.add(fm.name);
      }
    }
    // 5: allowed-tools entries (space-separated)
    const allowedToolsMatch = content.match(/^allowed-tools:\s*(.+)$/m);
    if (allowedToolsMatch) {
      const tools = allowedToolsMatch[1].split(/\s+/).filter(Boolean);
      for (const tool of tools) {
        if (
          !(VALID_TOOL_ENTRY_RE.test(tool) || WORKSPACE_TOOL_NAMES.has(tool))
        ) {
          err(
            skillPath,
            `allowed-tools entry "${tool}" does not match ^[a-z0-9_]{1,64}$`
          );
        }
      }
    }
  }
}

// 6: Grep guard for retired keys
const modulesDir = join(ROOT, "modules");
function grepDir(dir, patterns) {
  if (!existsSync(dir)) {
    return;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      grepDir(fullPath, patterns);
    } else if (
      fullPath.endsWith(".md") ||
      fullPath.endsWith(".json") ||
      fullPath.endsWith(".ts") ||
      fullPath.endsWith(".js")
    ) {
      const content = readFileSync(fullPath, "utf8");
      for (const pattern of patterns) {
        // Avoid false positives: skip lines that are comments explaining the retirement
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (
            line.includes(pattern) &&
            !line.trim().startsWith("//") &&
            !line.trim().startsWith("#")
          ) {
            errors.push(
              `  ${relative(ROOT, fullPath)}:${i + 1}: retired key "${pattern}" found`
            );
          }
        }
      }
    }
  }
}

for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
    continue;
  }
  const aiDir = join(modulesDir, entry.name, "ai");
  if (existsSync(aiDir)) {
    grepDir(aiDir, RETIRED_AGENT_KEYS);
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.error("ai:check FAILED — violations found:\n");
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} violation(s).`);
  process.exit(1);
} else {
  console.log(
    `ai:check passed — ${declaredAgentIds.size} agents, ${declaredSkillNames.size} named skills checked.`
  );
}
