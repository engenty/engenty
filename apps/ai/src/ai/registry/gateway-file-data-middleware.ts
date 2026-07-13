// Normalizes `file` parts in the model prompt so attachments survive the
// Vercel AI Gateway. Mastra's Session file path leaves `data` as the string it
// was handed (raw base64 / data URL), but the wire format is the AI SDK v4
// `SharedV4FileData` discriminated union — inline bytes must be
// `{ type: "data", data: <base64 string> }`. Two rejected alternatives, kept
// for the record:
//   - a bare string fails the remote schema ("expected object, received
//     string");
//   - `{ type: "data", data: <Uint8Array> }` is valid per spec but triggers
//     the gateway provider's local `maybeEncodeFileParts`, which rewrites it
//     to `{ type: "url", url: "data:..." }` — forwarded to Vertex as a
//     fileUri, which Google rejects.
import type { LanguageModelMiddleware } from "ai";

const DATA_URL_PATTERN = /^data:([^;,]*)(;base64)?,(.*)$/s;

function toDiscriminatedData(data: string): {
  data: { data: string; type: "data" } | { type: "url"; url: string };
  mediaType?: string;
} | null {
  const dataUrl = data.match(DATA_URL_PATTERN);
  if (dataUrl) {
    const [, urlMediaType, isBase64, payload = ""] = dataUrl;
    try {
      const base64 = isBase64
        ? payload
        : Buffer.from(decodeURIComponent(payload), "utf8").toString("base64");
      return {
        data: { data: base64, type: "data" },
        ...(urlMediaType ? { mediaType: urlMediaType } : {}),
      };
    } catch {
      return null;
    }
  }
  if (/^https?:/i.test(data)) {
    return { data: { type: "url", url: data } };
  }
  // Any other URI scheme: leave untouched.
  if (/^[a-z][a-z0-9+.-]*:/i.test(data)) {
    return null;
  }
  // Bare base64.
  return { data: { data, type: "data" } };
}

function normalizePart(part: unknown): unknown {
  if (!part || typeof part !== "object") {
    return part;
  }
  const record = part as { data?: unknown; mediaType?: string; type?: string };
  if (record.type !== "file" || typeof record.data !== "string") {
    return part;
  }
  const converted = toDiscriminatedData(record.data);
  if (!converted) {
    return part;
  }
  return {
    ...record,
    data: converted.data,
    ...(converted.mediaType && !record.mediaType
      ? { mediaType: converted.mediaType }
      : {}),
  };
}

export const gatewayFileDataMiddleware: LanguageModelMiddleware = {
  transformParams: ({ params }) => {
    const prompt = params.prompt;
    if (!Array.isArray(prompt)) {
      return Promise.resolve(params);
    }
    const nextPrompt = prompt.map((message) => {
      const content = (message as { content?: unknown }).content;
      if (!Array.isArray(content)) {
        return message;
      }
      return {
        ...(message as object),
        content: content.map((part) => normalizePart(part)),
      };
    });
    return Promise.resolve({
      ...params,
      prompt: nextPrompt,
    } as typeof params);
  },
};
