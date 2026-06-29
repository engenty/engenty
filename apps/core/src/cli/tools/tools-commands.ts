import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import {
  callCoreApi,
  callCoreApiWithAcceptedStatuses,
  defaultApiUrl,
} from "../core-api.js";
import { readToolInput } from "./tools-input.js";
import { renderContractsTable, type ToolContractView } from "./tools-render.js";

interface CommonToolOpts {
  apiUrl?: string;
  token?: string;
}

/** API responses use the { ok, data } envelope; unwrap when present. */
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function contractsEndpoint(moduleId?: string): string {
  return moduleId
    ? `/api/${encodeURIComponent(moduleId)}/tools`
    : "/api/tools/contracts";
}

export function registerToolsCommands(program: Command): void {
  const tools = program
    .command("tools")
    .description(
      "List, inspect, and call module operations (the governed tool surface)"
    );

  tools
    .command("list")
    .description("List tool contracts available to the authenticated principal")
    .option("--module <id>", "Limit to one module")
    .option("--json", "Raw JSON output")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(
        async (opts: CommonToolOpts & { json?: boolean; module?: string }) => {
          const result = await callCoreApi(
            opts,
            "GET",
            contractsEndpoint(opts.module)
          );
          const contracts = unwrap<ToolContractView[]>(result);
          if (opts.json) {
            console.log(JSON.stringify(contracts, null, 2));
            return;
          }
          console.log(renderContractsTable(contracts));
        }
      )
    );

  tools
    .command("schema")
    .description("Show one tool contract (input/output JSON schema, auth)")
    .argument("<toolId>", "Tool id (e.g. invoices_create)")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(async (toolId: string, opts: CommonToolOpts) => {
        const result = await callCoreApi(
          opts,
          "GET",
          `/api/tools/contracts/${encodeURIComponent(toolId)}`
        );
        console.log(JSON.stringify(unwrap(result), null, 2));
      })
    );

  tools
    .command("call")
    .description(
      "Invoke a tool (capability, policy, approval, and audit apply)"
    )
    .argument("<toolId>", "Tool id (e.g. invoices_create)")
    .option("--input <value>", "JSON object, @file.json, or - for stdin", "{}")
    .option("--module <id>", "Use the module-scoped endpoint")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(
        async (
          toolId: string,
          opts: CommonToolOpts & { input?: string; module?: string }
        ) => {
          const input = await readToolInput(opts.input ?? "{}");
          const endpoint = opts.module
            ? `/api/${encodeURIComponent(opts.module)}/tools/${encodeURIComponent(toolId)}/invoke`
            : `/api/tools/${encodeURIComponent(toolId)}/invoke`;
          const result = await callCoreApiWithAcceptedStatuses<
            Record<string, unknown>
          >(opts, "POST", endpoint, { input }, [202]);
          if (result.status === "approval_required") {
            console.error(
              JSON.stringify({
                ok: false,
                status: "approval_required",
                approvalRequestId: result.approvalRequestId,
                expiresAt: result.expiresAt,
                reason: result.reason,
                hint: "A reviewer must decide via /api/security/approvals/<id>/decision; re-run the call afterwards.",
              })
            );
            process.exitCode = 2;
            return;
          }
          console.log(JSON.stringify(result, null, 2));
        }
      )
    );
}
