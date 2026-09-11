import type { Command } from "commander";
import { runCliAction } from "../cli-errors.js";
import { cyan, dim, green, red, yellow } from "../env-setup/env-style.js";
import {
  loadProbes,
  loadRequiredSchemas,
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

export function registerDoctorCommands(program: Command): void {
  program
    .command("doctor")
    .description(
      "Check a Supabase deployment for the two settings migrations cannot make: exposed schemas and the access-token hook"
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
          serviceKey?: string;
          json?: boolean;
        }) => {
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
          const probes = await loadProbes();

          const schemaProbe = anonKey
            ? await probes.probeExposedSchemas({ url, anonKey, required })
            : { ok: false, error: "No anon key — pass --anon-key." };
          const selfCheck = serviceKey
            ? await probes.probeDeploymentSelfCheck({
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
