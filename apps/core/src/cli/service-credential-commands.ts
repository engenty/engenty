import { runCliAction } from "@engenty/cli";
import { AI_SERVICE_PLAN_CAPABILITIES } from "@engenty/plugin-sdk";
import type { Command } from "commander";
import { createAuthStores } from "../security/auth-stores/index.js";
import { callCoreApi, defaultApiUrl } from "./core-api.js";
import {
  ensureLocalServiceCredential,
  isLocalSupabaseUrl,
} from "./local-service-credential.js";

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

/** Locked-down AI service mint: coarse module.* plus Plan facets the matcher does not infer. */
const AI_SERVICE_RECOMMENDED_CAPS = [
  "module.read",
  "module.write",
  "module.execute",
  ...AI_SERVICE_PLAN_CAPABILITIES,
] as const;

/**
 * `engenty service-token …` — durable credentials for headless services
 * (PLAN-service-identity.md).
 *
 * Distinct from `engenty auth tokens`: that mints a long-lived bearer you send
 * as an Authorization header. This mints a secret whose only power is to be
 * exchanged for a 15-minute access token at POST /api/auth/service-token — so
 * the value that sits in an env var is never itself a session.
 *
 * The credential is always created in YOUR tenant with capabilities clamped to
 * your own; there is no --tenant flag, because a cross-tenant credential would
 * be a privilege escalation dressed up as a convenience.
 */
export function registerServiceCredentialCommands(program: Command): void {
  const credentials = program
    .command("service-token")
    .description(
      "Durable service credentials — exchanged for short-lived access tokens"
    );

  credentials
    .command("create")
    .requiredOption("--name <name>", "Credential name, e.g. ai-service")
    .option(
      "--capability <cap>",
      `Grant a capability (repeatable, or comma-separated). Default: inherit yours. For apps/ai list ${AI_SERVICE_RECOMMENDED_CAPS.join(",")}. module.read does not cover module.tasks.read.`,
      (value: string, previous: string[]) => [...previous, ...csv(value)],
      [] as string[]
    )
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(
        async (
          opts: CommonOpts & {
            capability: string[];
            name: string;
          }
        ) => {
          const result = await callCoreApi<{
            capabilities: string[];
            credentialId: string;
            name: string;
            secret: string;
          }>(opts, "POST", "/api/auth/service-credentials", {
            capabilities: opts.capability,
            name: opts.name,
          });
          console.log(JSON.stringify(result, null, 2));
          console.error(
            `\nThe secret above is shown ONCE — only its sha256 is stored.\nSet it on the service that needs it:\n  ENGENTY_AI_SERVICE_SECRET=${result.secret}\n`
          );
          if (opts.name === "ai-service" && opts.capability.length > 0) {
            const missing = AI_SERVICE_PLAN_CAPABILITIES.filter(
              (cap) => !result.capabilities.includes(cap)
            );
            if (missing.length > 0) {
              console.error(
                `Warning: this credential is missing Plan caps (${missing.join(", ")}). Locked-down tokens that only list module.read / module.write will 403 on module.tasks.* — the matcher has no infix wildcards.\n`
              );
            }
          }
        }
      )
    );

  // The local stack's AI credential, kept in step by `engenty setup`: no
  // bearer, no API — straight into the developer's own Supabase, refused for
  // anything that is not localhost. `--json` is the contract setup reads.
  credentials
    .command("ensure-local")
    .description(
      "Local dev only: keep ENGENTY_AI_SERVICE_SECRET backed by a live row in the local Supabase, minting a platform credential when it is missing, revoked or stale"
    )
    .option("--json", "Print the result as JSON (what `engenty setup` reads)")
    .action(
      runCliAction(async (opts: { json?: boolean }) => {
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!isLocalSupabaseUrl(supabaseUrl)) {
          throw new Error(
            `service-token ensure-local only writes to a local Supabase (SUPABASE_URL is ${supabaseUrl ?? "unset"}). Use \`engenty service-token create\` against a deployment.`
          );
        }
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          throw new Error(
            "SUPABASE_SERVICE_ROLE_KEY is unset — run `engenty env init` first."
          );
        }
        const result = await ensureLocalServiceCredential({
          configured: process.env.ENGENTY_AI_SERVICE_SECRET,
          stores: createAuthStores({}).serviceCredentials,
        });
        if (opts.json) {
          console.log(JSON.stringify(result));
          return;
        }
        if (result.status === "kept") {
          console.log(
            `ENGENTY_AI_SERVICE_SECRET is backed by credential ${result.credentialId}.`
          );
          return;
        }
        console.log(
          `Minted local credential ${result.credentialId} (${result.reason === "missing" ? "none was configured" : `the configured one was ${result.reason.replace("_", " ")}`}).\nSet it on apps/ai:\n  ENGENTY_AI_SERVICE_SECRET=${result.secret}`
        );
      })
    );

  credentials
    .command("list")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(async (opts: CommonOpts) => {
        const result = await callCoreApi(
          opts,
          "GET",
          "/api/auth/service-credentials"
        );
        console.log(JSON.stringify(result, null, 2));
      })
    );

  credentials
    .command("revoke")
    .argument("<credentialId>", "Credential id from `service-token list`")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT (or set ENGENTY_TOKEN)")
    .action(
      runCliAction(async (credentialId: string, opts: CommonOpts) => {
        const result = await callCoreApi(
          opts,
          "DELETE",
          `/api/auth/service-credentials/${encodeURIComponent(credentialId)}`
        );
        console.log(JSON.stringify(result, null, 2));
        console.error(
          "\nRevoked. Tokens already minted stay valid for up to 15 minutes."
        );
      })
    );
}
