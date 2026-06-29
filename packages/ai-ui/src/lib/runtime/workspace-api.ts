// Admin client for an agent's Mastra workspace: the resolved mount topology plus
// read/write into browsable mounts, and the effective (static) system prompt.
// Backs the agent-detail Workspace tab and the Instructions effective-preview.

import { requestAiServiceJson } from "./ai-service-client";

export interface WorkspaceMountView {
  access: "ro" | "rw";
  available: boolean;
  browsable: boolean;
  path: string;
  requiresBinding: boolean;
  scope: string;
  source: string;
  storagePrefix: string | null;
}

export interface AgentWorkspaceView {
  configurable: boolean;
  enabled: boolean;
  mounts: WorkspaceMountView[];
  preset: string;
  sandbox?: Record<string, unknown>;
  search?: { bm25?: boolean; vector?: boolean };
  skills?: { discoveryPaths?: string[] };
}

export interface WorkspaceFileEntry {
  is_dir: boolean;
  name: string;
  /** Full path relative to the mount root (e.g. `scripts/build.md`). */
  path: string;
  size: number | null;
  updated_at: string | null;
}

function agentBase(agentId: string): string {
  return `/ai/registry/agents/${encodeURIComponent(agentId)}/workspace`;
}

/** Resolved mount topology + workspace config (no run required). */
export function getAgentWorkspace(agentId: string, signal?: AbortSignal) {
  return requestAiServiceJson<{ workspace: AgentWorkspaceView | null }>(
    agentBase(agentId),
    { signal }
  );
}

/** Full recursive file list for a mount (the UI builds + caches the tree). */
export function getWorkspaceTree(
  agentId: string,
  mount: string,
  signal?: AbortSignal
) {
  const search = new URLSearchParams({ mount });
  return requestAiServiceJson<{
    read_only: boolean;
    files: WorkspaceFileEntry[];
    truncated: boolean;
  }>(`${agentBase(agentId)}/tree?${search.toString()}`, { signal });
}

/** Read a single file's text content. */
export function readWorkspaceFile(
  agentId: string,
  mount: string,
  path: string,
  signal?: AbortSignal
) {
  const search = new URLSearchParams({ mount, path });
  return requestAiServiceJson<{
    key: string;
    path: string;
    content: string;
    read_only: boolean;
  }>(`${agentBase(agentId)}/file?${search.toString()}`, { signal });
}

/** Write (upsert) a file. Rejected by the server on read-only mounts. */
export function writeWorkspaceFile(
  agentId: string,
  input: { mount: string; path: string; content: string }
) {
  return requestAiServiceJson<{ key: string; path: string }>(
    `${agentBase(agentId)}/file`,
    { body: JSON.stringify(input), method: "PUT" }
  );
}

/** Delete a file. Rejected by the server on read-only mounts. */
export function deleteWorkspaceFile(
  agentId: string,
  mount: string,
  path: string
) {
  const search = new URLSearchParams({ mount, path });
  return requestAiServiceJson<{ deleted: boolean; path: string }>(
    `${agentBase(agentId)}/file?${search.toString()}`,
    { method: "DELETE" }
  );
}

/** Effective static system prompt (AGENTS.md + SOUL.md + skill hint). */
export function getAgentEffectiveInstructions(
  agentId: string,
  signal?: AbortSignal
) {
  return requestAiServiceJson<{
    instructions: string;
    source: string | null;
  }>(`/ai/registry/agents/${encodeURIComponent(agentId)}/instructions`, {
    signal,
  });
}
