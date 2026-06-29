import type { FrontendToolCallResult } from "@engenty/ag-ui-bridge";

import { agentRequestHeaders } from "./agent-api-shared.js";

/** Must match `AI_BASE_PATH` in `apps/ai` (`/ai`). */
const AI_BASE_PATH = "/ai";

export async function postFrontendToolRunResult(params: {
  result: FrontendToolCallResult;
  serviceBaseUrl: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<void> {
  const base = params.serviceBaseUrl.trim().replace(/\/$/, "");
  if (!(base.startsWith("http://") || base.startsWith("https://"))) {
    throw new Error("ai: serviceBaseUrl must be an absolute HTTP(S) URL");
  }
  const url = `${base}${AI_BASE_PATH}/v1/runs/${encodeURIComponent(
    params.result.run_id
  )}/frontend-tools/${encodeURIComponent(params.result.call_id)}/result`;
  const res = await fetch(url, {
    method: "POST",
    headers: await agentRequestHeaders(),
    body: JSON.stringify(params.result),
    signal: params.signal,
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(
      `ai frontend-tool result HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
}
