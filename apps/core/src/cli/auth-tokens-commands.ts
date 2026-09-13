import { runCliAction } from "@engenty/cli";
import type { Command } from "commander";
import { callCoreApi, defaultApiUrl } from "./core-api.js";

interface CommonOpts {
  apiUrl?: string;
  token?: string;
}

function csv(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** `engenty auth tokens …` — long-lived API keys for agents/CI (ENGENTY_TOKEN). */
export function registerAuthTokensCommands(auth: Command): void {
  const tokens = auth
    .command("tokens")
    .description("API keys for agents/CI — capabilities clamped to yours");

  tokens
    .command("create")
    .requiredOption("--name <name>", "Key name (shown in listings)")
    .option("--type <type>", "agent | service", "agent")
    .option(
      "--capabilities <csv>",
      "Requested capabilities (clamped to your own; default: inherit yours)"
    )
    .option("--modules <csv>", "Restrict to module ids")
    .option("--expires <days>", "Expiry in days", "30")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(
        async (
          opts: CommonOpts & {
            capabilities?: string;
            expires?: string;
            modules?: string;
            name: string;
            type?: string;
          }
        ) => {
          const result = await callCoreApi<{
            capabilities: string[];
            expiresAt: string;
            token: string;
            tokenId: string;
          }>(opts, "POST", "/api/auth/api-tokens", {
            capabilities: csv(opts.capabilities),
            expiresInDays: Number(opts.expires ?? 30),
            moduleIds: csv(opts.modules),
            name: opts.name,
            principalType: opts.type === "service" ? "service" : "agent",
          });
          console.log(JSON.stringify(result, null, 2));
          console.error(
            "\nThis token is shown ONCE. For agents/CI:\n  export ENGENTY_TOKEN=" +
              result.token.slice(0, 12) +
              "…  (full value above)"
          );
        }
      )
    );

  tokens
    .command("list")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(async (opts: CommonOpts) => {
        const result = await callCoreApi(opts, "GET", "/api/auth/api-tokens");
        console.log(JSON.stringify(result, null, 2));
      })
    );

  tokens
    .command("revoke")
    .argument("<tokenId>", "Token id from `auth tokens list`")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(async (tokenId: string, opts: CommonOpts) => {
        const result = await callCoreApi(
          opts,
          "DELETE",
          `/api/auth/api-tokens/${encodeURIComponent(tokenId)}`
        );
        console.log(JSON.stringify(result, null, 2));
      })
    );
}
