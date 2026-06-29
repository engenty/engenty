import type { AgentRunStore } from "../../dal/agent-sessions/agent-run-store.js";
import type { AgentSessionStore } from "../../dal/agent-sessions/index.js";
import type { AiSessionScope } from "../sessions/types.js";
import { destroyEngentySandboxById } from "./destroy-engenty-sandbox.js";
import {
  type EngentyDockerSandboxRow,
  listEngentyDockerSandboxes,
} from "./engenty-sandbox-docker.js";
import { parseEngentySandboxId } from "./parse-engenty-sandbox-id.js";

export interface EngentySandboxCatalogEntry {
  container_id: string;
  container_name: string;
  lifecycle: "session" | "run" | "task";
  sandbox_id: string;
  scope_key: string;
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
  store: AgentSessionStore;
  threadTitleById: Map<string, string | null>;
}): Promise<EngentySandboxCatalogEntry | null> {
  const parsed = parseEngentySandboxId(input.row.sandbox_id);
  if (!parsed) {
    return null;
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
    const session = await input.store.getSession({
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
    scope_key: parsed.scope_key,
    state: input.row.state,
    thread_id: threadId,
    title,
  };
}

export async function listEngentySandboxesForScope(input: {
  getRunStore?: () => AgentRunStore | null;
  scope: AiSessionScope;
  store: AgentSessionStore;
}): Promise<EngentySandboxCatalogEntry[]> {
  const rows = await listEngentyDockerSandboxes({ runningOnly: true });
  const threadTitleById = new Map<string, string | null>();
  const entries: EngentySandboxCatalogEntry[] = [];
  for (const row of rows) {
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
  store: AgentSessionStore;
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
    const threadId = await resolveThreadIdForSandbox({
      getRunStore: input.getRunStore,
      parsed,
      scope: input.scope,
    });
    if (!threadId) {
      continue;
    }
    const session = await input.store.getSession({
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
