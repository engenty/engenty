// Approving what a flow's agent proposed is a write to the SUBJECT record, so
// it runs on the AI service (which owns the flow lane and resolves the task's
// binding) rather than through the tasks API.
import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";

function resolveAiServiceBaseUrl(): string | null {
  const raw = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_ENGENTY_AI_BASE_URL;
  const normalized = (raw ?? "").trim().replace(/\/$/, "");
  return normalized.length > 0 ? normalized : null;
}

export async function applyTaskFieldUpdates(
  taskId: string,
  input: { approved: { field: string; value: string | null }[] }
): Promise<{ applied: number; ok: boolean }> {
  const baseUrl = resolveAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  return requestApiJson<{ applied: number; ok: boolean }>(
    `/ai/v1/tasks/${encodeURIComponent(taskId)}/field-updates`,
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
}
