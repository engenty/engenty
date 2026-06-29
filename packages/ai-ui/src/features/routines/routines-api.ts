import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export interface RoutineDto {
  agent_id: string | null;
  description: string | null;
  enabled: boolean;
  enabled_by_default: boolean;
  id: string;
  last_result: string | null;
  last_run_at: string | null;
  module_id: string;
  name: string;
  next_due_at: string | null;
  prompt: string | null;
  quiet_hours: string | null;
  schedule: string;
  schedule_override: string | null;
  schedules: string[];
  source: "module" | "builtin" | "custom";
  target_kind: "agent_prompt" | "action" | "task_template";
  thread_id: string | null;
}

export interface CustomRoutineInput {
  agent_id: string;
  description?: string | null;
  enabled?: boolean;
  name: string;
  prompt: string;
  quiet_hours?: string | null;
  schedules: string[];
}

export async function listRoutines(
  signal?: AbortSignal
): Promise<{ routines: RoutineDto[] }> {
  return requestAiServiceJson<{ routines: RoutineDto[] }>("/ai/v1/routines", {
    signal,
  });
}

export async function patchRoutineState(
  id: string,
  patch: { enabled?: boolean; schedule_override?: string | null }
): Promise<{ state: any }> {
  return requestAiServiceJson<{ state: any }>(
    `/ai/v1/routines/${encodeURIComponent(id)}/state`,
    {
      body: JSON.stringify(patch),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }
  );
}

export async function runRoutineNow(
  id: string
): Promise<{ ok: boolean; result: string }> {
  return requestAiServiceJson<{ ok: boolean; result: string }>(
    `/ai/v1/routines/${encodeURIComponent(id)}/run`,
    {
      method: "POST",
    }
  );
}

export async function createCustomRoutine(
  body: CustomRoutineInput
): Promise<{ routine: any }> {
  return requestAiServiceJson<{ routine: any }>("/ai/v1/routines/custom", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

export async function updateCustomRoutine(
  id: string,
  body: Partial<CustomRoutineInput>
): Promise<{ routine: any }> {
  return requestAiServiceJson<{ routine: any }>(
    `/ai/v1/routines/custom/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }
  );
}

export async function deleteCustomRoutine(
  id: string
): Promise<{ ok: boolean }> {
  return requestAiServiceJson<{ ok: boolean }>(
    `/ai/v1/routines/custom/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  );
}
