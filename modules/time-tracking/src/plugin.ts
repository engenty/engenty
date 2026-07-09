import { createConnectionsModuleClient } from "@engenty/connections-sdk";
import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { timeTrackingAiRegistration } from "../ai/registrar.js";
import { registerTimeTrackingApi } from "./api/index.js";
import { createTimeTrackingRepoSupabase } from "./dal/supabase.js";
import { timeEntryInputSchema } from "./schema/zod.js";

const TIME_ENTRIES_SCHEMA_DESCRIPTION =
  "Time entry create schema (use snake_case). REQUIRED: date (YYYY-MM-DD string), hours (positive number). Optional: user_id (string), notes (string or null), project_id, phase_id, task_id, discipline, manual_project_title, manual_phase_title, manual_task_title (strings or null).";

const registerTimeTrackingPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "time-tracking.viewer",
      title: "Time tracking viewer",
      capabilities: ["module.time-tracking.read"],
    },
    {
      id: "time-tracking.editor",
      title: "Time tracking editor",
      capabilities: ["module.time-tracking.read", "module.time-tracking.write"],
    },
  ]);
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }

  const { invokeOperation } = createPluginServerGatewayCaller(engenty.server);

  const repoOrFactory = (auth: { tenantId: string; scopeId: string }) =>
    createTimeTrackingRepoSupabase(supabase, auth.tenantId, auth.scopeId);

  // Read-only external-calendar overlay: fetch events through the connections
  // framework's calendar connectors (Google Calendar today). Null-safe if the
  // connections tables aren't present.
  const connectionsClient = createConnectionsModuleClient(
    supabase as SupabaseClient,
    { moduleId: "time-tracking" }
  );

  registerTimeTrackingApi(engenty.server, repoOrFactory, {
    connectionsClient,
    supabase,
  });

  engenty.server.registerAiRegistration(
    timeTrackingAiRegistration({ invokeTimeTrackingOperation: invokeOperation })
  );

  engenty.server.registerTestDataType({
    meta: {
      createOperationId: "time_tracking_entries_create",
      module_id: "time-tracking",
      data_type: "time_entries",
      description: "Time tracking entries (manual-project style)",
      recordSchema: timeEntryInputSchema,
      schemaDescription: TIME_ENTRIES_SCHEMA_DESCRIPTION,
    },
    persist: async (records, ctx) => {
      const scopeId = ctx.scopeId ?? "default";
      const principalId = ctx.auth?.principalId ?? "test-data-system";
      const repo = repoOrFactory({
        tenantId: ctx.tenantId,
        scopeId,
      });
      let created = 0;
      for (const raw of records) {
        const parsed = timeEntryInputSchema.parse(raw) as z.infer<
          typeof timeEntryInputSchema
        >;
        await repo.create({
          user_id: parsed.user_id ?? principalId,
          created_by: principalId,
          date: parsed.date,
          hours: parsed.hours,
          start_time: parsed.start_time ?? null,
          notes: parsed.notes ?? null,
          project_id: parsed.project_id ?? null,
          phase_id: parsed.phase_id ?? null,
          task_id: parsed.task_id ?? null,
          discipline: parsed.discipline ?? null,
          manual_project_title: parsed.manual_project_title ?? null,
          manual_phase_title: parsed.manual_phase_title ?? null,
          manual_task_title: parsed.manual_task_title ?? null,
        });
        created++;
      }
      return created;
    },
  });
};

export default registerTimeTrackingPlugin;
