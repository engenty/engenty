#!/usr/bin/env node
/**
 * HISTORICAL one-shot (2026-08). Do not run. ACTION.md → *.workflow.json
 * already landed. Kept so git history still explains the conversion.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(
  new URL("../packages/ai-core/package.json", import.meta.url)
);
const matter = require("@11ty/gray-matter");

function findFiles(dir, name, out = []) {
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(p, name, out);
    } else if (entry.name === name) {
      out.push(p);
    }
  }
  return out;
}

function normList(value) {
  if (value === undefined) {
    return;
  }
  const list = Array.isArray(value) ? value : String(value).split(/\s+/);
  const items = list.map((s) => String(s).trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function firstProseLine(body) {
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    return line.replace(/^-+\s*/, "").trim();
  }
  return;
}

function oneStepGraph({
  id,
  agentId,
  brief,
  description,
  inputSchema,
  metadata,
}) {
  const mapConfig = {
    agent_type_key: { value: agentId },
    brief: { value: brief.trim() },
    input: { initData: true, path: "" },
    thread_mode: { value: metadata?.thread_mode ?? "new" },
    ...(metadata?.allowed_tools?.length
      ? { allowed_tools: { value: metadata.allowed_tools } }
      : {}),
  };
  delete metadata?.thread_mode;
  return {
    id,
    ...(description ? { description } : {}),
    inputSchema: inputSchema ?? { type: "object" },
    outputSchema: {},
    ...(metadata && Object.keys(metadata).length ? { metadata } : {}),
    graph: [
      { id: "prepare", mapConfig: JSON.stringify(mapConfig), type: "mapping" },
      { id: "run", toolId: "run_specialist", type: "tool" },
    ],
  };
}

const moduleDirs = readdirSync("modules", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => join("modules", e.name));

let actions = 0;
for (const moduleDir of moduleDirs) {
  if (moduleDir.includes("dist")) {
    continue;
  }
  for (const file of findFiles(join(moduleDir, "ai", "actions"), "ACTION.md")) {
    const parsed = matter(readFileSync(file, "utf8"));
    const fm = parsed.data;
    const allowedTools = normList(
      fm["allowed-tools"] ?? fm.allowed_tools ?? fm.allowedTools
    );
    const skills = normList(fm.skills ?? fm.skill_keys);
    const metadata = {
      title: fm.name,
      owner_agent_id: fm.agent_id,
      ...(fm.context_type ? { context_type: fm.context_type } : {}),
      ...(allowedTools ? { allowed_tools: allowedTools } : {}),
      ...(skills ? { skills } : {}),
      // reuse/new is a per-step concern now; "none" had no graph meaning.
      thread_mode: fm.default_thread_mode === "new" ? "new" : "reuse",
    };
    const workflow = oneStepGraph({
      id: fm.id,
      agentId: fm.agent_id,
      brief: parsed.content.trim(),
      description:
        (fm.description ?? firstProseLine(parsed.content)) || undefined,
      inputSchema: fm.input_schema_json,
      metadata,
    });
    const outDir = join(moduleDir, "ai", "workflows");
    mkdirSync(outDir, { recursive: true });
    const local = fm.id.includes(".")
      ? fm.id.split(".").slice(1).join(".")
      : fm.id;
    writeFileSync(
      join(outDir, `${local}.workflow.json`),
      JSON.stringify(workflow, null, 2) + "\n"
    );
    rmSync(file);
    const actionDir = dirname(file);
    if (readdirSync(actionDir).length === 0) {
      rmSync(actionDir, { recursive: true });
    }
    actions++;
  }
}

// ROUTINE.md → agent.json triggers + one-step workflow for prompt targets.
const routineScopes = { "inbox.sync": "tenant" };
let routines = 0;
for (const moduleDir of moduleDirs) {
  for (const file of findFiles(
    join(moduleDir, "ai", "routines"),
    "ROUTINE.md"
  )) {
    const parsed = matter(readFileSync(file, "utf8"));
    const fm = parsed.data;
    const agentId = fm.target?.agent_id;
    if (!agentId) {
      throw new Error(`no target.agent_id in ${file}`);
    }
    const localId = fm.id.includes(".")
      ? fm.id.split(".").slice(1).join(".")
      : fm.id;
    let workflowId;
    if (fm.target.kind === "prompt") {
      workflowId = fm.id;
      const workflow = oneStepGraph({
        id: fm.id,
        agentId,
        brief: parsed.content.trim(),
        description: fm.name,
        inputSchema: { type: "object" },
        metadata: {
          title: fm.name,
          owner_agent_id: agentId,
          thread_mode: "reuse",
        },
      });
      const outDir = join(moduleDir, "ai", "workflows");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, `${localId}.workflow.json`),
        JSON.stringify(workflow, null, 2) + "\n"
      );
    } else {
      workflowId = fm.target.action_id;
    }
    // find the agent.json for agentId — in this module, or (cross-module
    // owner like memory→copilot) wherever it lives.
    const manifests = findFiles("modules", "agent.json").filter(
      (p) => !p.includes("dist")
    );
    const manifestPath = manifests.find((p) => {
      try {
        return JSON.parse(readFileSync(p, "utf8")).id === agentId;
      } catch {
        return false;
      }
    });
    if (!manifestPath) {
      throw new Error(`no agent.json for ${agentId} (${file})`);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.triggers = manifest.triggers ?? [];
    manifest.triggers.push({
      id: fm.id,
      name: fm.name,
      workflow: workflowId,
      kind: "schedule",
      cron: fm.schedule,
      scope: routineScopes[fm.id] ?? "space",
      enabled_by_default: fm.enabled_by_default ?? true,
      ...(fm.quiet_hours ? { quiet_hours: fm.quiet_hours } : {}),
      ...(fm.suppress_if_no_op ? { suppress_if_no_op: true } : {}),
      // The trigger declaration's module — the workflow may live elsewhere.
      module: moduleDir.split("/").pop(),
    });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    rmSync(file);
    const routineDir = dirname(file);
    if (readdirSync(routineDir).length === 0) {
      rmSync(routineDir, { recursive: true });
    }
    routines++;
  }
}
console.log(`converted ${actions} ACTION.md, ${routines} ROUTINE.md`);
