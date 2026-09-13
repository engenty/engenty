import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { cyan, dim, green, red, yellow } from "../env-setup/env-style.js";
import { currentWorkspaceRoot } from "../workspace.js";
import { type LocalCheck, runHostChecks } from "./host-checks.js";
import { runLocalChecks } from "./local-checks.js";
import {
  loadRequiredSchemas,
  probeDeploymentSelfCheck,
  probeExposedSchemas,
  type SchemaProbe,
  type SelfCheckProbe,
} from "./supabase-checks.js";

const OK = () => green("✓");
const BAD = () => red("✗");

function reportSchemas(probe: SchemaProbe, required: string[]): boolean {
  if (probe.error) {
    console.log(`${BAD()} Exposed schemas — ${probe.error}`);
    return false;
  }
  if (probe.ok) {
    console.log(
      `${OK()} Exposed schemas — all ${required.length} required schemas are served`
    );
    return true;
  }

  const missing = probe.missing ?? [];
  console.log(
    `${BAD()} Exposed schemas — ${missing.length} missing: ${yellow(missing.join(", "))}`
  );
  console.log(
    dim(
      "    Without these, engenty-ai crash-loops on 'Could not query the database for the schema cache'."
    )
  );
  console.log(
    dim("    Supabase Cloud: Settings → API → Exposed schemas. Self-hosted: ")
  );
  console.log(dim(`    PGRST_DB_SCHEMAS=${cyan(required.join(","))}`));
  return false;
}

function reportSelfCheck(probe: SelfCheckProbe): boolean {
  if (probe.rpcMissing) {
    console.log(`${BAD()} Access-token hook — ${probe.error}`);
    return false;
  }
  if (probe.error) {
    console.log(`${BAD()} Access-token hook — ${probe.error}`);
    return false;
  }

  const checks = probe.checks ?? {};
  if (probe.ok) {
    console.log(
      `${OK()} Access-token hook — core.custom_access_token_hook exists and auth can call it`
    );
    console.log(
      dim(
        `    ${checks.applied_migrations} migrations applied, latest ${checks.latest_migration}`
      )
    );
    return true;
  }

  console.log(`${BAD()} Access-token hook — the database is not ready for it:`);
  const labels: [string, string][] = [
    ["hook_function_exists", "core.custom_access_token_hook(jsonb) exists"],
    ["hook_executable_by_auth", "EXECUTE granted to supabase_auth_admin"],
    ["auth_can_use_core_schema", "USAGE on schema core"],
    ["auth_can_read_users", "SELECT on core.users"],
    ["auth_can_read_tenant_settings", "SELECT on core.tenant_settings"],
  ];
  for (const [key, label] of labels) {
    console.log(`    ${checks[key] ? OK() : BAD()} ${label}`);
  }
  console.log(
    dim("    All false usually means migrations have not run on this database.")
  );
  return false;
}

/**
 * Inside a checkout: its local dev setup. Outside: the machine itself — the
 * prerequisites `engenty create` needs before there is a checkout.
 */
async function runLocalDoctor(json: boolean): Promise<void> {
  const root = currentWorkspaceRoot();
  const checks: LocalCheck[] = root
    ? await runLocalChecks(root)
    : runHostChecks();
  if (json) {
    console.log(JSON.stringify({ checks, root }, null, 2));
  } else {
    console.log(
      root
        ? `Checkout: ${cyan(root)}\n`
        : `No checkout here — checking this machine. ${dim("Get one with `npx engenty create <dir>`.")}\n`
    );
    for (const check of checks) {
      const mark =
        check.status === "ok"
          ? OK()
          : check.status === "warn"
            ? yellow("!")
            : BAD();
      console.log(
        `${mark} ${check.label}${check.detail ? ` — ${check.detail}` : ""}`
      );
      if (check.fix) {
        console.log(dim(`    fix: ${check.fix}`));
      }
    }
  }
  if (checks.some((check) => check.status === "fail")) {
    throw new Error("engenty doctor found problems (see above).");
  }
}

export function registerDoctorCommands(program: Command): void {
  program
    .command("doctor")
    .description(
      "Read-only health check. Inside a checkout: its local dev setup (Docker, Supabase, migrations, generated files, env, ports); elsewhere: this machine's prerequisites. --remote: a Supabase deployment's exposed schemas and access-token hook"
    )
    .option(
      "--remote",
      "Check a Supabase deployment instead of the local checkout (implied by --url)"
    )
    .option("--url <url>", "Supabase URL (default: SUPABASE_URL)")
    .option("--anon-key <key>", "Anon key (default: SUPABASE_ANON_KEY)")
    .option(
      "--service-key <key>",
      "Service-role key (default: SUPABASE_SERVICE_ROLE_KEY)"
    )
    .option("--json", "Print the raw probe results instead of a report")
    .action(
      runCliAction(
        async (options: {
          url?: string;
          anonKey?: string;
          remote?: boolean;
          serviceKey?: string;
          json?: boolean;
        }) => {
          if (!(options.remote || options.url)) {
            await runLocalDoctor(options.json === true);
            return;
          }
          const url = options.url ?? process.env.SUPABASE_URL ?? "";
          const anonKey =
            options.anonKey ?? process.env.SUPABASE_ANON_KEY ?? "";
          const serviceKey =
            options.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

          if (!url) {
            throw new Error(
              "No Supabase URL — pass --url or set SUPABASE_URL. Point it at the deployment you want checked, not necessarily this machine."
            );
          }

          const required = await loadRequiredSchemas();

          const schemaProbe = anonKey
            ? await probeExposedSchemas({ url, anonKey, required })
            : { ok: false, error: "No anon key — pass --anon-key." };
          const selfCheck = serviceKey
            ? await probeDeploymentSelfCheck({
                url,
                serviceRoleKey: serviceKey,
              })
            : { ok: false, error: "No service-role key — pass --service-key." };

          if (options.json) {
            console.log(
              JSON.stringify({ url, required, schemaProbe, selfCheck }, null, 2)
            );
          } else {
            console.log(`Supabase: ${cyan(url)}\n`);
            reportSchemas(schemaProbe, required);
            reportSelfCheck(selfCheck);
          }

          if (!(schemaProbe.ok && selfCheck.ok)) {
            throw new Error("engenty doctor found problems (see above).");
          }
        }
      )
    );
}
