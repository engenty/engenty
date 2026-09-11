#!/usr/bin/env node
/**
 * One-shot (PLAN-mounted-engentys T2.5): delete redundant `core.space_mount`
 * agent rows for MODULE-owned agents. Since T2.1 those agents derive from the
 * module mount itself, so an explicit row is dead weight — and under the
 * no-legacy rules dead rows do not get to linger.
 *
 * The list mirrors the agents whose AgentConfig carries a `moduleId`
 * (defineModuleAi stamps it; copilot/coordinator disclaim theirs and stay
 * baseline rows). Regenerate by grepping the module agent.json manifests.
 *
 * Reaches the local Supabase Postgres via `docker exec <container> psql`,
 * the same lane the coverage checks use.
 */
import { execSync } from "node:child_process";
import { resolveSupabaseDbContainerName } from "./supabase-sync-lib.mjs";

const MODULE_AGENT_IDS = [
  "company-profile.manager",
  "contacts.manager",
  "engenty.app-coder",
  "engenty.remote",
  "inbox.assist",
  "invoices.manager",
  "knowledge-base.answers",
  "knowledge-base.manager",
  "offers.manager",
  "tasks.assist",
  "time-tracking.reporter",
  "time-tracking.tracker",
];

const containerName = resolveSupabaseDbContainerName(process.cwd());
const list = MODULE_AGENT_IDS.map((id) => `'${id}'`).join(", ");
const query = `delete from core.space_mount where resource_type = 'agent' and resource_key in (${list}) returning space_id, resource_key;`;
const out = execSync(
  `docker exec -i ${containerName} psql -U postgres -d postgres -t -A -c "${query.replace(/"/g, '\\"')}"`,
  { encoding: "utf8" }
);
const rows = out.trim().split("\n").filter(Boolean);
console.log(`deleted ${rows.length} derived agent mount row(s)`);
