// Origin on the record: who asked, where, in words.
//
// A row that reads "inbox_sync_run: needs your approval (agent acting)" with
// no space and an actor uuid nobody can resolve is not something a person
// can act on. The producer that files the event knows the principal, the
// space and the operation; this module turns those ids into the labels the
// list shows, and into the coalesce key that keeps one row per open ask.
import type { NotificationActor } from "./contracts.js";

export interface AgentLabel {
  /** The registry id (`inbox.assist`) — what desks and hrefs are keyed on. */
  id: string;
  name: string;
}

export interface SpaceLabel {
  key: string;
  name: string;
}

/** Lookups the resolver needs; injected so the package stays schema-free. */
export interface OriginLookups {
  /** By core principal uuid OR registry id; null when unknown. */
  agent(tenantId: string, id: string): Promise<AgentLabel | null>;
  space(tenantId: string, id: string): Promise<SpaceLabel | null>;
  user(tenantId: string, id: string): Promise<{ name: string } | null>;
}

/** The keys under `metadata` the list reads. */
export interface OriginMetadata {
  actor_label?: string;
  actor_ref?: string;
  space_key?: string;
  space_name?: string;
}

export interface ResolvedOrigin {
  actor: NotificationActor;
  metadata: OriginMetadata;
  spaceId: string | null;
}

/**
 * Resolve an actor + space into labels. An unknown agent id stays an agent
 * (the gate said so) with the id as its label, so the row still says
 * something rather than nothing.
 */
export async function resolveOrigin(
  input: {
    actorId: string | null;
    actorKind: "agent" | "user" | "system";
    spaceId: string | null;
    tenantId: string;
  },
  lookups: OriginLookups
): Promise<ResolvedOrigin> {
  const metadata: OriginMetadata = {};
  let actor: NotificationActor = { id: input.actorId, kind: input.actorKind };
  if (input.actorId && input.actorKind === "agent") {
    const agent = await lookups.agent(input.tenantId, input.actorId);
    if (agent) {
      actor = { id: agent.id, kind: "agent" };
      metadata.actor_label = agent.name;
      metadata.actor_ref = `agent:${agent.id}`;
    } else {
      metadata.actor_label = input.actorId;
      metadata.actor_ref = `agent:${input.actorId}`;
    }
  } else if (input.actorId && input.actorKind === "user") {
    const user = await lookups.user(input.tenantId, input.actorId);
    metadata.actor_label = user?.name ?? input.actorId;
    metadata.actor_ref = `user:${input.actorId}`;
  }
  if (input.spaceId) {
    const space = await lookups.space(input.tenantId, input.spaceId);
    if (space) {
      metadata.space_key = space.key;
      metadata.space_name = space.name;
    }
  }
  return { actor, metadata, spaceId: input.spaceId };
}

/**
 * One row per open ask: the same actor asking for the same operation in the
 * same space merges into the open row instead of stacking one per fire.
 */
export function coalesceKeyFor(input: {
  actorRef: string | null | undefined;
  operationId: string;
  spaceId: string | null | undefined;
}): string {
  return `${input.actorRef ?? "unknown"}:${input.operationId}:${input.spaceId ?? "global"}`;
}

/**
 * `inbox_sync_run` → `inbox sync run`: readable without a manifest lookup.
 * With the owning module, its prefix goes (`connections.execute_action` →
 * `execute action`) — the module is already the row's context.
 */
export function humanizeOperationId(
  operationId: string,
  moduleId?: string | null
): string {
  let id = operationId;
  if (moduleId) {
    for (const sep of [".", "_", ":"]) {
      const prefix = `${moduleId.replace(/-/g, "_")}${sep}`;
      const alt = `${moduleId}${sep}`;
      if (id.startsWith(alt) && id.length > alt.length) {
        id = id.slice(alt.length);
        break;
      }
      if (id.startsWith(prefix) && id.length > prefix.length) {
        id = id.slice(prefix.length);
        break;
      }
    }
  }
  return id.replace(/[_.:-]+/g, " ").trim();
}

/**
 * The English fallback summary for an approval ask; the UI composes a
 * localized line from the same metadata when it has it.
 */
export function approvalSummary(input: {
  actorLabel: string | undefined;
  operationId: string;
  spaceName: string | undefined;
}): string {
  const who = input.actorLabel ?? "An agent";
  const what = humanizeOperationId(input.operationId);
  return input.spaceName
    ? `${who} wants to run ${what} in ${input.spaceName}`
    : `${who} wants to run ${what}`;
}

type RowsResult = Promise<{ data: Record<string, unknown>[] | null }>;
interface SelectChain extends RowsResult {
  eq: (column: string, value: string) => SelectChain;
  in: (column: string, values: string[]) => SelectChain;
  limit: (n: number) => SelectChain;
  or: (filters: string) => SelectChain;
}

/** The slice of a service-role client the lookups use (structural, so a SupabaseClient fits). */
export interface OriginServiceDb {
  schema: (name: string) => {
    from: (table: string) => {
      select: (columns: string) => SelectChain;
    };
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Origin lookups over the service lane. An agent arrives as its core
 * principal uuid (`x-engenty-agent-id`) or as its registry id; both resolve
 * through `ai.engenty_ai_agents`, whose `core_agent_id` is that uuid. A
 * builtin module agent (`inbox.assist`) has no registry row; its core
 * principal carries the key as `name` (see apps/ai core-agent-link).
 */
export function originLookupsFromServiceDb(db: OriginServiceDb): OriginLookups {
  return {
    agent: async (tenantId, id) => {
      const query = db
        .schema("ai")
        .from("engenty_ai_agents")
        .select("agent_id, name")
        .eq("tenant_id", tenantId);
      const { data } = await (UUID_RE.test(id)
        ? query.or(`core_agent_id.eq.${id},id.eq.${id}`)
        : query.eq("agent_id", id)
      ).limit(1);
      const row = (data ?? [])[0] as
        | { agent_id: string; name: string }
        | undefined;
      if (row) {
        return { id: row.agent_id, name: row.name };
      }
      if (!UUID_RE.test(id)) {
        return null;
      }
      const { data: principals } = await db
        .schema("core")
        .from("agents")
        .select("name")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .limit(1);
      const principal = (principals ?? [])[0] as { name: string } | undefined;
      return principal ? { id: principal.name, name: principal.name } : null;
    },
    space: async (tenantId, id) => {
      const { data } = await db
        .schema("core")
        .from("spaces")
        .select("key, name")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .limit(1);
      const row = (data ?? [])[0] as { key: string; name: string } | undefined;
      return row ? { key: row.key, name: row.name } : null;
    },
    user: async (tenantId, id) => {
      const { data } = await db
        .schema("core")
        .from("users")
        .select("display_name, email")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .limit(1);
      const row = (data ?? [])[0] as
        | { display_name: string | null; email: string }
        | undefined;
      return row ? { name: row.display_name || row.email } : null;
    },
  };
}
