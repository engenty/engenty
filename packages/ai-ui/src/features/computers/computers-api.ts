// The live computers: every sandbox container this scope may see, plus the
// host's admission picture (held / limit / queued). One endpoint, already
// tenant-scoped server-side; killing goes through the same route the sandbox
// sweep uses, so a kill here is a real destroy, not a hidden flag.
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export interface ComputerDto {
  agent_id: string | null;
  container_id: string;
  container_name: string;
  created_at_ms: number | null;
  /** A space computer's Space folder on the host, and its quota. */
  drive: { bytes: number; max_bytes: number } | null;
  lifecycle: "session" | "run" | "task" | "space" | "browser";
  sandbox_id: string;
  scope_key: string;
  space_id: string | null;
  state: string;
  thread_id: string | null;
  title: string | null;
}

export interface ComputeAdmissionDto {
  held: number;
  limit: number;
  /** Serialized commands waiting/running per space computer, by sandbox id. */
  machine_queues?: Record<string, number>;
  queued: number;
}

const BASE = "/ai/sandboxes";

export function listComputers(signal?: AbortSignal): Promise<{
  compute: ComputeAdmissionDto;
  sandboxes: ComputerDto[];
}> {
  return requestAiServiceJson(BASE, { signal });
}

export function killComputers(
  sandboxIds: string[]
): Promise<{ destroyed: number }> {
  return requestAiServiceJson(BASE, {
    body: JSON.stringify({ sandbox_ids: sandboxIds }),
    method: "DELETE",
  });
}

/** Stop (not destroy) space computers and user browsers — they sleep and wake on the next use. */
export function stopComputers(
  sandboxIds: string[]
): Promise<{ stopped: number }> {
  return requestAiServiceJson(`${BASE}/stop`, {
    body: JSON.stringify({ sandbox_ids: sandboxIds }),
    method: "POST",
  });
}
