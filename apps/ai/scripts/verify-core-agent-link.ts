// One-shot integration check for ensureCoreAgentId against the local stack.
// Run: pnpm --filter @engenty/ai exec tsx scripts/verify-core-agent-link.ts

import { ensureCoreAgentId } from "../src/dal/registry/core-agent-link.js";
import { createAiDatabaseAdapter } from "../src/infra/database.js";

const TENANT = process.env.VERIFY_TENANT_ID ?? "";
if (!TENANT) {
  throw new Error("VERIFY_TENANT_ID required");
}
const client = createAiDatabaseAdapter();
if (!client) {
  throw new Error("no service-role client (SUPABASE_URL / SERVICE_ROLE_KEY)");
}

const first = await ensureCoreAgentId(client, TENANT, "engenty.copilot");
const second = await ensureCoreAgentId(client, TENANT, "engenty.copilot");
console.log(JSON.stringify({ first, second, idempotent: first === second }));

const { data } = await client
  .schema("core")
  .from("agents")
  .select("id, name, status")
  .eq("tenant_id", TENANT)
  .eq("name", "engenty.copilot");
console.log(JSON.stringify({ rows: data?.length, row: data?.[0] }));
