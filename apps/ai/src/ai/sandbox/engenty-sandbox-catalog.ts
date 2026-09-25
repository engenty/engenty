import type { AgentRunStore } from "../../dal/threads/agent-run-store.js";
import type { ThreadStore } from "../../dal/threads/index.js";
import type { AiSessionScope } from "../sessions/types.js";
import { destroyEngentySandboxById } from "./destroy-engenty-sandbox.js";
import {
  type EngentyDockerSandboxRow,
  listEngentyDockerSandboxes,
} from "./engenty-sandbox-docker.js";
import { parseEngentySandboxId } from "./parse-engenty-sandbox-id.js";
import { stopSpaceComputerContainer } from "./space-computer.js";
import { getSpaceDriveUsage } from "./space-drives.js";

export interface EngentySandboxCatalogEntry {
  /** Which agent's computer this is — a thread can run more than one. */
  agent_id: string | null;
  container_id: string;
  container_name: string;
  /** When the container started, so a stuck one is visible as a stuck one. */
  created_at_ms: number | null;
  /**
   * A space computer's Space folder on the host, as the last sweep measured
   * it (`du`), and the quota it is held to; null on other rows or before the
   * first sweep.
   */
  drive: { bytes: number; max_bytes: number } | null;
  lifecycle: "session" | "run" | "task" | "space" | "browser";
  sandbox_id: string;
  scope_key: string;
  /** The space a `space` computer or `browser` row belongs to; null for run rows. */
  space_id: string | null;
  state: string;
  thread_id: string | null;
  title: string | null;
}

async function resolveThreadIdForSandbox(input: {
  getRunStore?: () => AgentRunStore | null;
  parsed: NonNullable<ReturnType<typeof parseEngentySandboxId>>;
  scope: AiSessionScope;
}): Promise<string | null> {
  if (input.parsed.thread_id) {
    return input.parsed.thread_id;
  }
  if (input.parsed.lifecycle !== "run") {
    return null;
  }
  const runStore = input.getRunStore?.() ?? null;
  if (!runStore) {
    return null;
  }
  const run = await runStore.getRun({
    runId: input.parsed.scope_suffix,
    tenantId: input.scope.tenantId,
  });
  return run?.thread_id ?? null;
}

async function enrichSandboxRow(input: {
  getRunStore?: () => AgentRunStore | null;
  row: EngentyDockerSandboxRow;
  scope: AiSessionScope;
  store: ThreadStore;
  threadTitleById: Map<string, string | null>;
}): Promise<EngentySandboxCatalogEntry | null> {
  const parsed = parseEngentySandboxId(input.row.sandbox_id);
  if (!parsed) {
    return null;
  }
  // The space computer and browser belong to a SPACE, not a thread — its id carries the
  // tenant, and that is the visibility check: every member of the tenant may
  // see (and stop/reset) their spaces' machines. There is no thread to title
  // it; the UI names it by its space.
  if (parsed.lifecycle === "space" || parsed.lifecycle === "browser") {
    if (parsed.tenant_id !== input.scope.tenantId) {
      return null;
    }
    const usage =
      parsed.lifecycle === "space" && parsed.space_id
        ? getSpaceDriveUsage(input.scope.tenantId, parsed.space_id)
        : null;
    return {
      container_id: input.row.container_id,
      container_name: input.row.container_name,
      lifecycle: parsed.lifecycle,
      sandbox_id: parsed.sandbox_id,
      agent_id: null,
      created_at_ms: input.row.created_at_ms,
      drive: usage ? { bytes: usage.bytes, max_bytes: usage.maxBytes } : null,
      scope_key: parsed.scope_key,
      space_id: parsed.space_id,
      state: input.row.state,
      thread_id: null,
      title: null,
    };
  }
  const threadId = await resolveThreadIdForSandbox({
    getRunStore: input.getRunStore,
    parsed,
    scope: input.scope,
  });
  if (!threadId) {
    return null;
  }
  let title = input.threadTitleById.get(threadId) ?? null;
  if (title === undefined) {
    const session = await input.store.getThread({
      tenantId: input.scope.tenantId,
      threadId,
    });
    if (!session || session.created_by_user_id !== input.scope.userId) {
      return null;
    }
    title = session.title ?? null;
    input.threadTitleById.set(threadId, title);
  }
  return {
    container_id: input.row.container_id,
    container_name: input.row.container_name,
    lifecycle: parsed.lifecycle,
    sandbox_id: parsed.sandbox_id,
    agent_id: parsed.agent_id,
    created_at_ms: input.row.created_at_ms,
    drive: null,
    scope_key: parsed.scope_key,
    space_id: null,
    state: input.row.state,
    thread_id: threadId,
    title,
  };
}

export async function listEngentySandboxesForScope(input: {
  getRunStore?: () => AgentRunStore | null;
  scope: AiSessionScope;
  store: ThreadStore;
}): Promise<EngentySandboxCatalogEntry[]> {
  // `all`, not `running`: a STOPPED space computer is a real row — "asleep,
  // wakes on the next command" — while a stopped per-run container is just a
  // corpse the sweeps will collect, so those keep the running-only filter.
  const rows = await listEngentyDockerSandboxes({ runningOnly: false });
  const threadTitleById = new Map<string, string | null>();
  const entries: EngentySandboxCatalogEntry[] = [];
  for (const row of rows) {
    if (row.state !== "running") {
      const lifecycle = parseEngentySandboxId(row.sandbox_id)?.lifecycle;
      if (!(lifecycle === "space" || lifecycle === "browser")) {
        continue;
      }
    }
    const entry = await enrichSandboxRow({
      getRunStore: input.getRunStore,
      row,
      scope: input.scope,
      store: input.store,
      threadTitleById,
    });
    if (entry) {
      entries.push(entry);
    }
  }
  entries.sort((left, right) =>
    (left.title ?? left.thread_id ?? "").localeCompare(
      right.title ?? right.thread_id ?? "",
      undefined,
      { sensitivity: "base" }
    )
  );
  return entries;
}

export async function destroyEngentySandboxesForScope(input: {
  getRunStore?: () => AgentRunStore | null;
  sandboxIds?: readonly string[];
  scope: AiSessionScope;
  store: ThreadStore;
}): Promise<{ destroyed: number }> {
  const targets =
    input.sandboxIds && input.sandboxIds.length > 0
      ? input.sandboxIds
      : (
          await listEngentySandboxesForScope({
            getRunStore: input.getRunStore,
            scope: input.scope,
            store: input.store,
          })
        ).map((entry) => entry.sandbox_id);
  let destroyed = 0;
  for (const sandboxId of targets) {
    const parsed = parseEngentySandboxId(sandboxId);
    if (!parsed) {
      continue;
    }
    // Destroying a space computer is Reset: the container and what it wrote
    // outside its binds go; the Space drive ($HOME, /sandbox, caches, the
    // browser profile) stays — Reset is about the container.
    // Tenant-gated like the listing.
    if (parsed.lifecycle === "space" || parsed.lifecycle === "browser") {
      if (parsed.tenant_id !== input.scope.tenantId) {
        continue;
      }
      await destroyEngentySandboxById(sandboxId).catch(() => undefined);
      destroyed += 1;
      continue;
    }
    const threadId = await resolveThreadIdForSandbox({
      getRunStore: input.getRunStore,
      parsed,
      scope: input.scope,
    });
    if (!threadId) {
      continue;
    }
    const session = await input.store.getThread({
      tenantId: input.scope.tenantId,
      threadId,
    });
    if (!session || session.created_by_user_id !== input.scope.userId) {
      continue;
    }
    await destroyEngentySandboxById(sandboxId).catch(() => undefined);
    destroyed += 1;
  }
  return { destroyed };
}

/**
 * Stop (not destroy) space computers — the Computers view's Stop action.
 *
 * Stop is machine-only by design: a per-run container that should end gets
 * destroyed with its run, while a machine is meant to sleep and wake. Only
 * running machines of the caller's tenant qualify; anything else in the list
 * is skipped, not an error.
 */
export async function stopEngentySpaceComputersForScope(input: {
  sandboxIds: readonly string[];
  scope: AiSessionScope;
}): Promise<{ stopped: number }> {
  const rows = await listEngentyDockerSandboxes({ runningOnly: true });
  const rowsBySandboxId = new Map(rows.map((row) => [row.sandbox_id, row]));
  let stopped = 0;
  for (const sandboxId of input.sandboxIds) {
    const parsed = parseEngentySandboxId(sandboxId);
    if (
      !(parsed?.lifecycle === "space" || parsed?.lifecycle === "browser") ||
      parsed.tenant_id !== input.scope.tenantId
    ) {
      continue;
    }
    const row = rowsBySandboxId.get(sandboxId);
    if (!row) {
      continue;
    }
    try {
      await stopSpaceComputerContainer(row.container_id);
      stopped += 1;
    } catch {
      // Already stopping, or gone — either way not running anymore.
    }
  }
  return { stopped };
}
