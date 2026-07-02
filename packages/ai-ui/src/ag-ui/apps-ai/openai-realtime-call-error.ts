interface OpenAiErrorPayload {
  error?: {
    code?: string | null;
    message?: string | null;
  };
}

export async function realtimeCallErrorMessage(
  response: Response
): Promise<string> {
  const prefix = `Realtime WebRTC call failed (${response.status})`;
  const body = (await response.text().catch(() => "")).trim();
  if (!body) {
    return prefix;
  }
  try {
    const { error } = JSON.parse(body) as OpenAiErrorPayload;
    const parts = [error?.code, error?.message].filter(
      (part): part is string => typeof part === "string" && part.length > 0
    );
    if (parts.length > 0) {
      return `${prefix}: ${parts.join(": ")}`;
    }
  } catch {
    // Non-JSON body — fall through to the raw text.
  }
  return `${prefix}: ${body}`;
}
