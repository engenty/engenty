// What `engenty …` typed in a sandbox shell does (deploy/sandbox/engenty.mjs).
//
// The CLI is a surface over the same pipeline as Code Mode's execute: the
// run's own token, its Space gate, grants and audit — runs inside the run's
// context, bound when the command started (`engenty-cli-relay.ts`). A shell
// command cannot suspend for a card, so a gated write without a grant exits 2
// with the recovery path instead, exactly like a sandbox program.

import { executeEngentyTool } from "./engenty-tool-execute-tool.js";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { normalizeToolContract } from "./lib/format.js";
import { getEngentyToolsRunContext } from "./lib/run-context.js";
import { isToolVisibleInSpace } from "./lib/space-gate.js";

export interface EngentyCliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

const USAGE = `Usage:
  engenty tools list [--module <id>] [--json]   operations this run may call
  engenty tools schema <tool_id>                one operation's input/output schema
  engenty tools call <tool_id> [--input <json>|@file.json|-]
                                                call it (exit 2: needs approval)
`;

function ok(stdout: string): EngentyCliResult {
  return { exitCode: 0, stderr: "", stdout };
}

function fail(stderr: string, exitCode = 1): EngentyCliResult {
  return {
    exitCode,
    stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n`,
    stdout: "",
  };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** `--flag value` pairs and bare flags; the rest are positionals. */
function parseArgs(argv: readonly string[]) {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (name === "json" || next === undefined || next.startsWith("--")) {
      flags.set(name, true);
    } else {
      flags.set(name, next);
      i += 1;
    }
  }
  return { flags, positionals };
}

function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, col) =>
    Math.max(...rows.map((row) => row[col]?.length ?? 0))
  );
  return `${rows
    .map((row) =>
      row
        .map((cell, col) => cell.padEnd(widths?.[col] ?? 0))
        .join("  ")
        .trimEnd()
    )
    .join("\n")}\n`;
}

async function list(flags: Map<string, string | true>) {
  const client = getCurrentEngentyToolsClient();
  if (!client.ok) {
    return fail(`engenty: ${client.message}`);
  }
  const moduleId = flags.get("module");
  const space = getEngentyToolsRunContext().space;
  const entries = (await client.client.listToolContracts())
    .map((contract) => {
      const entry = normalizeToolContract(contract);
      return {
        approval: entry.auth.requiresApproval,
        module: entry.moduleId ?? "",
        // The contract's own flag first, as engenty_tool_execute reads it.
        readOnly: contract.readOnly ?? entry.execution.readOnly,
        risk: entry.auth.riskLevel,
        summary: entry.summary ?? entry.title,
        tool: entry.tool.toolId,
      };
    })
    .filter(
      (entry) =>
        (typeof moduleId !== "string" || entry.module === moduleId) &&
        isToolVisibleInSpace(
          {
            operationId: entry.tool,
            ...(entry.module ? { moduleId: entry.module } : {}),
          },
          space
        )
    );
  if (flags.get("json") === true) {
    return ok(
      json(
        entries.map((entry) => ({
          module: entry.module || null,
          read_only: entry.readOnly,
          requires_approval: entry.approval,
          risk: entry.risk,
          summary: entry.summary,
          tool: entry.tool,
        }))
      )
    );
  }
  if (entries.length === 0) {
    return ok("No operations available to this run.\n");
  }
  return ok(
    table([
      ["TOOL", "MODULE", "RISK", "APPROVAL", "RW", "SUMMARY"],
      ...entries.map((entry) => [
        entry.tool,
        entry.module,
        entry.risk,
        entry.approval ? "yes" : "",
        entry.readOnly ? "ro" : "rw",
        entry.summary,
      ]),
    ])
  );
}

async function schema(toolId: string | undefined) {
  if (!toolId) {
    return fail(`engenty: tools schema needs a tool id\n\n${USAGE}`);
  }
  const client = getCurrentEngentyToolsClient();
  if (!client.ok) {
    return fail(`engenty: ${client.message}`);
  }
  const contract = await client.client.describeTool(toolId);
  return ok(json(contract));
}

async function call(
  toolId: string | undefined,
  input: string | true | undefined
) {
  if (!toolId) {
    return fail(`engenty: tools call needs a tool id\n\n${USAGE}`);
  }
  const text = typeof input === "string" ? input.trim() : "";
  if (text) {
    try {
      JSON.parse(text);
    } catch (err) {
      return fail(
        `engenty: --input is not valid JSON (${err instanceof Error ? err.message : String(err)}). Pass a JSON object, @file.json, or - for stdin.`
      );
    }
  }
  const result = (await executeEngentyTool(
    { id: toolId, input: text || "{}" },
    undefined,
    { sandbox: true }
  )) as { error?: unknown; ok?: unknown };
  if (result.ok === true) {
    return ok(json(result));
  }
  return fail(json(result), result.error === "approval_required" ? 2 : 1);
}

/** Run one `engenty` argv. Never throws: an error is exit 1 with a message. */
export async function runEngentyCli(
  argv: readonly string[]
): Promise<EngentyCliResult> {
  const [group, command, ...rest] = argv;
  if (!group || group === "help" || group === "--help" || group === "-h") {
    return ok(USAGE);
  }
  if (group !== "tools") {
    return fail(`engenty: unknown command "${group}"\n\n${USAGE}`);
  }
  const { flags, positionals } = parseArgs(rest);
  try {
    switch (command) {
      case "list":
        return await list(flags);
      case "schema":
        return await schema(positionals[0]);
      case "call":
        return await call(positionals[0], flags.get("input"));
      default:
        return ok(USAGE);
    }
  } catch (err) {
    return fail(`engenty: ${err instanceof Error ? err.message : String(err)}`);
  }
}
