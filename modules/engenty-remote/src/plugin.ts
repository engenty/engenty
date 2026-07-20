// src/plugin.ts — EngentyPluginFactory for the Remote module.
//
// Registers: the AI capability (engenty.remote agent), role profiles, and the
// gateway operations for channel bindings, external identities, and pairing.
// The channel runtime itself (Mastra AgentChannels + webhook routes + outbound
// consumer) lives in apps/ai (src/api/remote-channels.ts), mirroring the
// team-chat mention consumer split. The `remote_outbound` pgmq queue is the
// module→runtime seam for proactive sends.

import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { z } from "zod";
import { remoteAiRegistration } from "../ai/registrar.js";
import {
  claimPairing,
  deleteBinding,
  findPairingByCode,
  listBindings,
  listIdentities,
  type RemoteDbClient,
  resolveBindingForEvent,
  resolveIdentity,
  revokeIdentity,
  upsertBinding,
  upsertOpenPairingRequest,
} from "./dal/repo.js";
import { REMOTE_PLATFORMS } from "./schema/types.js";

const MODULE_ID = "engenty-remote";
const MANAGE = ["module.engenty-remote.manage"];
const PAIR = ["module.engenty-remote.pair"];
const NOTIFY = ["module.engenty-remote.write"];

export const REMOTE_OUTBOUND_QUEUE = "remote_outbound";

const platformSchema = z.enum(REMOTE_PLATFORMS);

const bindingShape = z.object({
  agent_id: z.string(),
  connection_id: z.string().nullable(),
  display_name: z.string().nullable(),
  external_workspace_id: z.string().nullable(),
  id: z.string(),
  platform: platformSchema,
  status: z.enum(["active", "disabled"]),
  unmapped_sender_policy: z.enum(["ignore", "invite", "deny"]),
});

const identityShape = z.object({
  display_name: z.string().nullable(),
  external_user_id: z.string(),
  id: z.string(),
  platform: platformSchema,
  user_id: z.string(),
  verified_at: z.string().nullable(),
});

const registerRemotePlugin: EngentyPluginFactory = (engenty) => {
  const { server } = engenty;

  const supabaseRaw = server.getDatabaseAdapter?.() ?? null;
  if (!supabaseRaw) {
    throw new Error("engenty-remote requires Supabase");
  }
  const supabase = supabaseRaw as unknown as RemoteDbClient;
  const queue = server.getQueueService?.() ?? null;

  // Register AI capability: engenty.remote AgentConfig + instruction docs.
  server.registerAiRegistration(remoteAiRegistration());

  server.registerRoleProfiles?.([
    {
      capabilities: [
        "module.engenty-remote",
        "module.engenty-remote.read",
        "module.engenty-remote.write",
        "module.engenty-remote.manage",
      ],
      id: "engenty-remote.manager",
      title: "Remote channels manager",
    },
  ]);

  // ── Binding management (admin) ─────────────────────────────────────────────

  server.registerOperation({
    handler: async (_input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("tenant required");
      }
      const rows = await listBindings(supabase, tenantId);
      return { bindings: rows.map((r) => bindingShape.parse(r)), ok: true };
    },
    idempotent: true,
    inputSchema: z.object({}),
    moduleId: MODULE_ID,
    operationId: "remote_bindings_list",
    outputSchema: z.object({
      bindings: z.array(bindingShape),
      ok: z.literal(true),
    }),
    requiredCapabilities: MANAGE,
    riskLevel: "low",
    summary: "List remote channel bindings (platform ↔ tenant)",
  });

  const bindingUpsertInput = z.object({
    agent_id: z.string().optional(),
    connection_id: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    external_workspace_id: z.string().nullable().optional(),
    id: z.string().optional(),
    platform: platformSchema,
    settings: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    unmapped_sender_policy: z.enum(["ignore", "invite", "deny"]).optional(),
  });

  server.registerOperation({
    handler: async (input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("tenant required");
      }
      const parsed = bindingUpsertInput.parse(input);
      const row = await upsertBinding(supabase, tenantId, parsed);
      return { binding: bindingShape.parse(row), ok: true };
    },
    inputSchema: bindingUpsertInput,
    moduleId: MODULE_ID,
    operationId: "remote_bindings_upsert",
    outputSchema: z.object({ binding: bindingShape, ok: z.literal(true) }),
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    summary: "Create or update a remote channel binding",
  });

  server.registerOperation({
    handler: async (input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("tenant required");
      }
      const parsed = z.object({ id: z.string() }).parse(input);
      await deleteBinding(supabase, tenantId, parsed.id);
      return { ok: true };
    },
    inputSchema: z.object({ id: z.string() }),
    moduleId: MODULE_ID,
    operationId: "remote_bindings_delete",
    outputSchema: z.object({ ok: z.literal(true) }),
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    summary: "Delete a remote channel binding",
  });

  // ── Identities (admin) ─────────────────────────────────────────────────────

  server.registerOperation({
    handler: async (_input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("tenant required");
      }
      const rows = await listIdentities(supabase, tenantId);
      return { identities: rows.map((r) => identityShape.parse(r)), ok: true };
    },
    idempotent: true,
    inputSchema: z.object({}),
    moduleId: MODULE_ID,
    operationId: "remote_identities_list",
    outputSchema: z.object({
      identities: z.array(identityShape),
      ok: z.literal(true),
    }),
    requiredCapabilities: MANAGE,
    riskLevel: "low",
    summary:
      "List verified external identities (messenger user → engenty user)",
  });

  server.registerOperation({
    handler: async (input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("tenant required");
      }
      const parsed = z.object({ id: z.string() }).parse(input);
      await revokeIdentity(supabase, tenantId, parsed.id);
      return { ok: true };
    },
    inputSchema: z.object({ id: z.string() }),
    moduleId: MODULE_ID,
    operationId: "remote_identity_revoke",
    outputSchema: z.object({ ok: z.literal(true) }),
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    summary: "Revoke a verified external identity mapping",
  });

  // ── Pairing (any tenant member, self-service) ──────────────────────────────

  server.registerOperation({
    handler: async (input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("tenant required");
      }
      const parsed = z.object({ code: z.string() }).parse(input);
      const request = await findPairingByCode(supabase, parsed.code);
      if (!request || request.tenant_id !== tenantId) {
        return { ok: true, request: null };
      }
      const expired = Date.parse(request.expires_at) < Date.now();
      return {
        ok: true,
        request: {
          claimed: request.claimed_at !== null,
          display_name: request.display_name,
          expired,
          platform: request.platform,
        },
      };
    },
    idempotent: true,
    inputSchema: z.object({ code: z.string() }),
    moduleId: MODULE_ID,
    operationId: "remote_pairing_info",
    outputSchema: z.object({
      ok: z.literal(true),
      request: z
        .object({
          claimed: z.boolean(),
          display_name: z.string().nullable(),
          expired: z.boolean(),
          platform: platformSchema,
        })
        .nullable(),
    }),
    requiredCapabilities: PAIR,
    riskLevel: "low",
    summary: "Inspect a pairing code before claiming it",
  });

  server.registerOperation({
    handler: async (input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      const userId = ctx.auth?.principalId;
      if (!(tenantId && userId)) {
        throw new Error("authenticated user required");
      }
      const parsed = z.object({ code: z.string() }).parse(input);
      const request = await findPairingByCode(supabase, parsed.code);
      if (!request || request.tenant_id !== tenantId) {
        throw new Error("pairing code not found");
      }
      if (request.claimed_at) {
        throw new Error("pairing code already claimed");
      }
      if (Date.parse(request.expires_at) < Date.now()) {
        throw new Error("pairing code expired");
      }
      const identity = await claimPairing(supabase, request, userId);
      return { identity: identityShape.parse(identity), ok: true };
    },
    inputSchema: z.object({ code: z.string() }),
    moduleId: MODULE_ID,
    operationId: "remote_pairing_claim",
    outputSchema: z.object({ identity: identityShape, ok: z.literal(true) }),
    requiredCapabilities: PAIR,
    riskLevel: "medium",
    summary:
      "Claim a pairing code: link the messenger identity that received it to your engenty account",
  });

  // ── Runtime resolution (called by the apps/ai channel runtime) ─────────────

  const resolveSenderInput = z.object({
    display_name: z.string().optional(),
    external_user_id: z.string(),
    external_workspace_id: z.string().nullable().optional(),
    platform: platformSchema,
  });

  server.registerOperation({
    handler: async (input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("tenant required");
      }
      const parsed = resolveSenderInput.parse(input);
      const binding = await resolveBindingForEvent(supabase, {
        externalWorkspaceId: parsed.external_workspace_id ?? null,
        platform: parsed.platform,
      });
      if (!binding || binding.tenant_id !== tenantId) {
        // The service principal is single-tenant: a binding owned by another
        // tenant is a misconfiguration, not a fallback (cf. task-job scope).
        return { binding: null, identity: null, ok: true, pairing_code: null };
      }
      const identity = await resolveIdentity(supabase, {
        externalUserId: parsed.external_user_id,
        platform: parsed.platform,
        tenantId: binding.tenant_id,
      });
      let pairingCode: string | null = null;
      if (!identity && binding.unmapped_sender_policy === "invite") {
        const request = await upsertOpenPairingRequest(supabase, {
          bindingId: binding.id,
          displayName: parsed.display_name ?? null,
          externalUserId: parsed.external_user_id,
          platform: parsed.platform,
          tenantId: binding.tenant_id,
        });
        pairingCode = request.code;
      }
      return {
        binding: bindingShape.parse(binding),
        identity: identity ? identityShape.parse(identity) : null,
        ok: true,
        pairing_code: pairingCode,
      };
    },
    inputSchema: resolveSenderInput,
    moduleId: MODULE_ID,
    operationId: "remote_runtime_resolve_sender",
    outputSchema: z.object({
      binding: bindingShape.nullable(),
      identity: identityShape.nullable(),
      ok: z.literal(true),
      pairing_code: z.string().nullable(),
    }),
    requiredCapabilities: MANAGE,
    riskLevel: "low",
    summary:
      "Resolve an inbound messenger sender to binding + identity (creates a pairing invite for unmapped senders under the invite policy)",
  });

  // ── Proactive sends (agents + modules → messenger threads) ─────────────────

  const notifyInput = z.object({
    external_thread_id: z.string().min(1),
    platform: platformSchema,
    text: z.string().min(1).max(4000),
  });

  server.registerOperation({
    handler: async (input, ctx) => {
      const tenantId = ctx.auth?.tenantId;
      if (!tenantId) {
        throw new Error("tenant required");
      }
      const parsed = notifyInput.parse(input);
      if (!queue) {
        throw new Error("queue service unavailable");
      }
      await queue.send(REMOTE_OUTBOUND_QUEUE, {
        external_thread_id: parsed.external_thread_id,
        platform: parsed.platform,
        tenant_id: tenantId,
        text: parsed.text,
      });
      return { ok: true };
    },
    inputSchema: notifyInput,
    moduleId: MODULE_ID,
    operationId: "remote_notify",
    outputSchema: z.object({ ok: z.literal(true) }),
    requiredCapabilities: NOTIFY,
    riskLevel: "medium",
    summary:
      "Post a proactive message into a bound messenger thread (queued; delivered by the channel runtime)",
  });
};

export default registerRemotePlugin;
