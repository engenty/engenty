// @engenty/notifications — the platform notification system as a core
// package. One record with four coordinates (tenant, space, audience, class),
// a channel registry for delivery, /api/notifications/* on core, and a host
// every module reaches as `engenty.server.notifications`.
//
// As a plugin (core process): registers the routes and turns core's
// `approval.requested` event into a decision record — the one platform-wide
// approval signal, whatever module the gated operation belongs to. The host
// itself is built by the loader before any plugin loads, so modules can use
// it regardless of load order.
//
// As a library (apps/ai, no plugin server): `createNotificationsHost` +
// `startDeliveryLoop` are consumed directly.
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { registerNotificationsApi } from "./src/api/routes.js";
import { startDeliveryLoop } from "./src/channels/registry.js";
import { vapidKeysFromEnv } from "./src/channels/web-push.js";
import type { NotificationsHost } from "./src/host.js";
import {
  approvalSummary,
  coalesceKeyFor,
  humanizeOperationId,
  type OriginServiceDb,
  originLookupsFromServiceDb,
  resolveOrigin,
} from "./src/origin.js";
import { type SweepSubjectStates, sweepStaleDecisions } from "./src/sweep.js";

export { registerNotificationsApi } from "./src/api/routes.js";
export {
  composeNotificationEmail,
  createEmailChannel,
  type EmailChannelDeps,
  type OperationInvoker,
} from "./src/channels/email.js";
export {
  type ChannelRegistry,
  createChannelRegistry,
  runDeliveryOnce,
  type StartDeliveryLoopOptions,
  startDeliveryLoop,
} from "./src/channels/registry.js";
export {
  createWebPushChannel,
  pushMessageFor,
  type VapidKeys,
  vapidKeysFromEnv,
} from "./src/channels/web-push.js";
export * from "./src/contracts.js";
export {
  createNotificationsStore,
  type ListNotificationsParams,
  type NotificationsDbSource,
  type NotificationsStore,
} from "./src/dal/store.js";
export {
  type CreateNotificationsHostOptions,
  createNotificationsHost,
  type NotificationsHost,
  notificationsPolicyFromEnv,
} from "./src/host.js";
export {
  type AgentLabel,
  approvalSummary,
  coalesceKeyFor,
  humanizeOperationId,
  type OriginLookups,
  type OriginMetadata,
  type OriginServiceDb,
  originLookupsFromServiceDb,
  type ResolvedOrigin,
  resolveOrigin,
  type SpaceLabel,
} from "./src/origin.js";
export {
  channelsFor,
  createNotificationsService,
  type EmitNotificationInput,
  type NotificationsService,
  type ResolveNotificationsInput,
  resolveNotificationAudiences,
  subscribersFor,
} from "./src/service.js";
export {
  type ApprovalRequestState,
  approvalOutcome,
  type RunState,
  runOutcome,
  type SweepSubjectStates,
  sweepStaleDecisions,
} from "./src/sweep.js";
export { notificationsInSpaceScope, visibleInSpace } from "./src/visibility.js";

/** Where a desk thread keeps its one open interrupt (ag-ui-bridge). */
const OPEN_INTERRUPT_KEY = "ag_ui_open_interrupt";

/** The slice of the service-role client the sweep and the tenant list use. */
interface ServiceDbLike extends OriginServiceDb {}

/** Subject state readers over the service lane: core's requests, ai's runs. */
function subjectStatesFrom(db: ServiceDbLike): SweepSubjectStates {
  return {
    approvalRequests: async (ids) => {
      const { data } = await db
        .schema("core")
        .from("approval_requests")
        .select("id, status, expires_at")
        .in("id", ids);
      return new Map(
        (
          (data ?? []) as { expires_at: string; id: string; status: string }[]
        ).map((row) => [
          row.id,
          { expires_at: row.expires_at, status: row.status },
        ])
      );
    },
    threadInterrupts: async (ids) => {
      // Open = some thread still carries that interrupt id as its one open
      // interrupt; cleared (answered, dismissed, healed) = gone.
      const column = `metadata->${OPEN_INTERRUPT_KEY}->>interrupt_id`;
      const { data } = await db
        .schema("ai")
        .from("thread")
        .select(`interrupt_id:${column}`)
        .in(column, ids);
      return new Set(
        ((data ?? []) as { interrupt_id: string | null }[])
          .map((row) => row.interrupt_id)
          .filter((id): id is string => Boolean(id))
      );
    },
    runs: async (ids) => {
      const { data } = await db
        .schema("ai")
        .from("agent_run")
        .select("id, status")
        .in("id", ids);
      return new Map(
        ((data ?? []) as { id: string; status: string }[]).map((row) => [
          row.id,
          { status: row.status },
        ])
      );
    },
  };
}

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const SWEEP_FIRST_DELAY_MS = 30 * 1000;

/** Every 15 minutes, per tenant: close decision records whose subject is over. */
function startDecisionSweep(input: {
  host: NotificationsHost;
  listTenantIds: () => Promise<string[]>;
  report: (message: string, detail?: string) => void;
  states: SweepSubjectStates;
}): () => void {
  let running = false;
  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      for (const tenantId of await input.listTenantIds()) {
        await sweepStaleDecisions({
          service: input.host.service,
          states: input.states,
          store: input.host.service.store,
          tenantId,
        });
      }
    } catch (error) {
      input.report(
        "decision sweep failed",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void tick(), SWEEP_FIRST_DELAY_MS);
  const interval = setInterval(() => void tick(), SWEEP_INTERVAL_MS);
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}

const registerNotificationsPlugin: EngentyPluginFactory = (engenty) => {
  const host = engenty.server.notifications as NotificationsHost | undefined;
  if (!host) {
    engenty.diagnostics.report({
      code: "notifications.host.unavailable",
      level: "warn",
      message:
        "notifications host unavailable (no database lane) — routes not registered",
      pluginId: engenty.id,
    });
    return;
  }
  registerNotificationsApi(engenty.server, {
    service: host.service,
    vapidPublicKey: () => vapidKeysFromEnv()?.publicKey ?? null,
  });

  // Deliver for the channels registered on THIS host (a transport module's
  // `registerChannel`). apps/ai runs the same loop for its own channels; the
  // ledger's compare-and-swap keeps the two from ever sending twice.
  let stopDelivery: (() => void) | null = null;
  let stopSweep: (() => void) | null = null;
  engenty.server.registerService({
    id: "notifications-delivery",
    reloadable: true,
    start: () => {
      const serviceDb = engenty.server.getServiceDb?.() as
        | ServiceDbLike
        | null
        | undefined;
      const listTenantIds = async () => {
        if (!serviceDb) {
          return [];
        }
        const { data } = await serviceDb
          .schema("core")
          .from("tenants")
          .select("id");
        return ((data ?? []) as { id: string }[]).map((row) => row.id);
      };
      stopDelivery = startDeliveryLoop({
        channels: host.channels,
        listTenantIds,
        store: host.service.store,
      });
      if (serviceDb) {
        stopSweep = startDecisionSweep({
          host,
          listTenantIds,
          report: (message, detail) =>
            engenty.diagnostics.report({
              code: "notifications.sweep",
              level: "warn",
              message: `${message}${detail ? `: ${detail}` : ""}`,
              pluginId: engenty.id,
            }),
          states: subjectStatesFrom(serviceDb),
        });
      }
    },
    stop: () => {
      stopDelivery?.();
      stopDelivery = null;
      stopSweep?.();
      stopSweep = null;
    },
  });

  // A decision made anywhere — chat card, the notification row, a superadmin
  // — closes the record. Core emits this after every decide.
  engenty.events.core.on(
    "approval.decided",
    async (payload, context) => {
      const tenantId =
        (typeof payload.tenant_id === "string" ? payload.tenant_id : null) ??
        context.tenantId ??
        null;
      const requestId =
        typeof payload.approval_request_id === "string"
          ? payload.approval_request_id
          : null;
      if (!(tenantId && requestId)) {
        return;
      }
      await host
        .resolve({
          outcome: "decided",
          subjectId: requestId,
          subjectType: "approval_request",
          tenantId,
        })
        .catch(() => {
          // The sweep closes it on its next pass.
        });
    },
    { tenantScoped: true }
  );

  // Every module's gated operation files one `approval.requested`; the inbox
  // subscribes to that one name instead of each module inventing fan-out.
  engenty.events.core.on(
    "approval.requested",
    async (payload, context) => {
      const tenantId =
        (typeof payload.tenant_id === "string" ? payload.tenant_id : null) ??
        context.tenantId ??
        null;
      const requestId =
        typeof payload.approval_request_id === "string"
          ? payload.approval_request_id
          : null;
      const operationId =
        typeof payload.operation_id === "string" ? payload.operation_id : null;
      if (!(tenantId && requestId && operationId)) {
        return;
      }
      const reason = typeof payload.reason === "string" ? payload.reason : null;
      const str = (value: unknown) =>
        typeof value === "string" && value ? value : null;
      // Who asked: the agent when the gate knew one, else the principal.
      const agentId = str(payload.agent_id);
      const actorId = agentId ?? str(payload.actor_id);
      const spaceId = str(payload.space_id);
      const serviceDb = engenty.server.getServiceDb?.() as
        | ServiceDbLike
        | null
        | undefined;
      const origin = serviceDb
        ? await resolveOrigin(
            {
              actorId,
              actorKind: agentId ? "agent" : "user",
              spaceId,
              tenantId,
            },
            originLookupsFromServiceDb(serviceDb)
          ).catch(() => null)
        : null;
      const actor = origin?.actor ?? { id: actorId, kind: "agent" as const };
      await host
        .emit({
          actor,
          // One row per open ask: a routine re-filing the same operation
          // every fire merges into the row a person already sees.
          coalesceKey: coalesceKeyFor({
            actorRef: origin?.metadata.actor_ref ?? `agent:${actorId ?? "?"}`,
            operationId,
            spaceId,
          }),
          dedupeKey: `approval-request:${requestId}`,
          kind: "approval_requested",
          metadata: {
            ...origin?.metadata,
            approval_request_id: requestId,
            module_id: str(payload.module_id),
            operation_id: operationId,
            ...(str(payload.goal_id)
              ? { thread_id: str(payload.goal_id) }
              : {}),
            ...(str(payload.task_id) ? { task_id: str(payload.task_id) } : {}),
            ...(str(payload.trigger_id)
              ? { routine_id: str(payload.trigger_id) }
              : {}),
            ...(actorId && actor.id !== actorId
              ? { actor_principal_id: actorId }
              : {}),
          },
          payload: {
            context: payload.context ?? null,
            reason,
          },
          priority: "high",
          source: "connections",
          ...(spaceId ? { spaceId } : {}),
          subject: { id: requestId, type: "approval_request" },
          summary: approvalSummary({
            actorLabel: origin?.metadata.actor_label,
            operationId,
            spaceName: origin?.metadata.space_name,
          }),
          tenantId,
        })
        .catch(() => {
          // Best-effort: the request row is already durable.
        });
    },
    { tenantScoped: true }
  );
  // An agent wrote something a person did not watch: one `update` per
  // actor + space, coalescing a batch into a single row ×N. Medium+ risk
  // only (D11) — reads and low-risk writes are not news.
  engenty.events.core.on(
    "operation.afterInvoke",
    async (payload, context) => {
      const str = (value: unknown) =>
        typeof value === "string" && value ? value : null;
      const tenantId = str(payload.tenant_id) ?? context.tenantId ?? null;
      const agentId = str(payload.agent_id);
      const operationId = str(payload.operation_id);
      const riskLevel = str(payload.risk_level);
      if (
        !(tenantId && agentId && operationId) ||
        riskLevel === null ||
        riskLevel === "low" ||
        payload.idempotent === true
      ) {
        return;
      }
      const spaceId = str(payload.space_id);
      await host
        .emit({
          actor: { id: agentId, kind: "agent" },
          coalesceKey: `agent:${agentId}:records_written:${spaceId ?? "global"}`,
          coalesceWindowMs: RECORDS_WRITTEN_WINDOW_MS,
          kind: "records_written",
          metadata: {
            module_id: str(payload.module_id),
            operation_id: operationId,
            risk_level: riskLevel,
          },
          priority: "low",
          source: str(payload.module_id) ?? "core",
          ...(spaceId ? { spaceId } : {}),
          summary: `ran ${humanizeOperationId(operationId)}`,
          tenantId,
        })
        .catch(() => {
          // FYI only; nothing to recover.
        });
    },
    { tenantScoped: true }
  );
};

/** A batch of writes within this window is one row ×N. */
const RECORDS_WRITTEN_WINDOW_MS = 10 * 60 * 1000;

export default registerNotificationsPlugin;
