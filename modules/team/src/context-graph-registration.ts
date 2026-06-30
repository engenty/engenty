// Team → context-graph wiring.
// Registers entity type `team.member` and edge type `team.reports_to`.
// Also registers a bulk-backfill source so the context-graph HTTP API can
// expose status and sync without coupling to the team module at package level.

import type {
  PluginContextGraphServerApi,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

interface ProfileRow {
  department: string | null;
  email: string | null;
  full_name: string | null;
  id: string;
  member_type: string | null;
  position: string | null;
}

interface OrgNodeRow {
  id: string;
  profile_id: string | null;
  reports_to_id: string | null;
}

const memberSchema = z
  .object({
    department: z.string().nullish(),
    email: z.string().nullish(),
    full_name: z.string().nullish(),
    member_type: z.string().nullish(),
    position: z.string().nullish(),
  })
  .loose();

export function registerTeamContextGraph(input: {
  server: Pick<
    PluginServerApi,
    "registerContextGraphSchema" | "registerContextGraphSource"
  >;
  supabase: SupabaseClient;
}): void {
  const { server, supabase } = input;
  if (!server.registerContextGraphSchema) {
    return;
  }
  server.registerContextGraphSchema({
    moduleId: "team",
    entityTypes: [
      {
        id: "team.member",
        displayName: "Member",
        attributesSchema: memberSchema,
      },
    ],
    edgeTypes: [
      {
        id: "team.reports_to",
        displayName: "Reports to",
        subjectTypes: ["team.member"],
        objectTypes: ["team.member"],
      },
    ],
  });

  server.registerContextGraphSource?.({
    id: "team",
    displayName: "Team",
    description: "Team members and organisational structure",
    entityTypeIds: ["team.member"],
    getStatus: async (api, tenantId) => {
      const [inGraphEntities, countResult] = await Promise.all([
        api.listEntities({ tenantId, module: "team" }),
        supabase
          .schema("module_team")
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
      ]);
      return {
        inGraph: (inGraphEntities as unknown[]).length,
        inSource: countResult.count ?? 0,
      };
    },
    sync: async (api, tenantId) =>
      syncTeamToContextGraph(supabase, api, tenantId),
  });
}

async function syncTeamToContextGraph(
  supabase: SupabaseClient,
  api: PluginContextGraphServerApi,
  tenantId: string
): Promise<{ edges: number; entities: number }> {
  const profilesResult = await supabase
    .schema("module_team")
    .from("profiles")
    .select("id, full_name, email, position, department, member_type")
    .eq("tenant_id", tenantId);

  if (profilesResult.error) {
    throw new Error(`profiles: ${profilesResult.error.message}`);
  }

  let entities = 0;
  for (const row of (profilesResult.data ?? []) as ProfileRow[]) {
    await api.upsertEntity({
      tenantId,
      type: "team.member",
      externalRef: { module: "team", entity: "member", id: row.id },
      name: row.full_name,
      attributes: {
        full_name: row.full_name,
        email: row.email,
        position: row.position,
        department: row.department,
        member_type: row.member_type,
      },
    });
    entities++;
  }

  const { data: orgNodeRows, error: orgErr } = await supabase
    .schema("module_team")
    .from("org_nodes")
    .select("id, profile_id, reports_to_id")
    .eq("tenant_id", tenantId)
    .not("profile_id", "is", null);

  if (orgErr) {
    throw new Error(`org_nodes: ${orgErr.message}`);
  }

  const orgNodeToProfileId = new Map<string, string>();
  for (const node of (orgNodeRows ?? []) as OrgNodeRow[]) {
    if (node.profile_id) {
      orgNodeToProfileId.set(node.id, node.profile_id);
    }
  }

  let edges = 0;
  for (const node of (orgNodeRows ?? []) as OrgNodeRow[]) {
    if (!(node.profile_id && node.reports_to_id)) {
      continue;
    }
    const managerProfileId = orgNodeToProfileId.get(node.reports_to_id);
    if (!managerProfileId) {
      continue;
    }
    const [subject, object] = await Promise.all([
      api.getEntity({
        tenantId,
        externalRef: { module: "team", entity: "member", id: node.profile_id },
      }),
      api.getEntity({
        tenantId,
        externalRef: {
          module: "team",
          entity: "member",
          id: managerProfileId,
        },
      }),
    ]);
    if (!(subject && object)) {
      continue;
    }
    await api.upsertEdge({
      tenantId,
      type: "team.reports_to",
      subjectId: (subject as { id: string }).id,
      objectId: (object as { id: string }).id,
      attributes: {},
    });
    edges++;
  }

  return { entities, edges };
}
