// The breakdown behind the context meter's prompt number, from apps/ai
// `/ai/v1/threads/:id/prompt-preview`.
//
// The server RECONSTRUCTS this per request rather than storing each run's
// assembled prompt (see apps/ai prompt-preview.ts), which has one consequence
// the UI must never paper over: these figures describe the NEXT run, not the one
// the meter is reporting. They will not add up to that run's `prompt_tokens`,
// and the panel says so rather than presenting a near-miss as the same number.
//
// Developer-mode only — the route 404s outside a development build, which is why
// callers gate the entry point on `useDeveloperModeEnabled` instead of showing a
// link that dead-ends.
import { getCurrentAccessToken } from "@engenty/api-client";
import { useQuery } from "@engenty/query-client";
import { normalizeAppsAiServiceBaseUrl } from "../../../ag-ui/apps-ai/apps-ai-api.js";
import { useEngentyAIContext } from "../../../agent-provider/engenty-ai-provider.js";

export interface PromptPreviewMessage {
  chars: number;
  estimated_tokens: number;
  id: string | null;
  role: string;
  text: string;
  text_truncated: boolean;
}

export type PromptToolSchemaSource = "ai-sdk" | "json-schema" | "none" | "zod";

export interface PromptPreviewTool {
  chars: number;
  description: string | null;
  estimated_tokens: number;
  name: string;
  schema_chars: number;
  /** `none` = the schema could not be read, so this tool's weight is understated. */
  schema_source: PromptToolSchemaSource;
}

export interface ThreadPromptPreview {
  agent_id: string;
  caveats: string[];
  messages: PromptPreviewMessage[];
  model_id: string | null;
  recalled_tokens: number | null;
  system: { chars: number; estimated_tokens: number; text: string };
  tools: PromptPreviewTool[];
  totals: {
    chars: number;
    estimated_tokens: number;
    message_chars: number;
    system_chars: number;
    tool_chars: number;
  };
}

export async function fetchThreadPromptPreview(
  serviceBaseUrl: string,
  threadId: string,
  signal?: AbortSignal
): Promise<ThreadPromptPreview> {
  // Bearer, not cookies: apps/ai is a separate origin from the SPA.
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("No access token available");
  }
  const url = `${normalizeAppsAiServiceBaseUrl(
    serviceBaseUrl
  )}/ai/v1/threads/${encodeURIComponent(threadId)}/prompt-preview`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error((body as { error?: string }).error ?? `HTTP ${res.status}`),
      { status: res.status, body }
    );
  }
  const data = (await res.json()) as { preview: ThreadPromptPreview };
  return data.preview;
}

export function threadPromptPreviewQueryKey(input: {
  serviceBaseUrl: string;
  threadId: string;
}) {
  return [
    "apps-ai",
    "thread-prompt-preview",
    input.serviceBaseUrl,
    input.threadId,
  ] as const;
}

/**
 * Assembling the preview costs a registry read, a tool build and a memory
 * recall, so it is fetched only while the panel is open (`enabled`) and never
 * refetched behind the reader's back — the numbers are a snapshot they are
 * actively reading, and having them shift mid-scroll would be worse than stale.
 */
export function useThreadPromptPreview(input: {
  enabled: boolean;
  threadId: string | null;
}) {
  const ai = useEngentyAIContext();

  const query = useQuery({
    enabled: Boolean(
      input.enabled &&
        ai.isTransportReady &&
        input.threadId &&
        ai.serviceBaseUrl
    ),
    queryFn: ({ signal }) =>
      fetchThreadPromptPreview(
        ai.serviceBaseUrl,
        input.threadId as string,
        signal
      ),
    queryKey: input.threadId
      ? threadPromptPreviewQueryKey({
          serviceBaseUrl: ai.serviceBaseUrl,
          threadId: input.threadId,
        })
      : ["apps-ai", "thread-prompt-preview", "idle"],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  return {
    error: query.error as Error | null,
    isLoading: query.isFetching,
    preview: query.data ?? null,
  };
}
