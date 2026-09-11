// Normalizes `file` parts in the model prompt so attachments survive the
// Vercel AI Gateway. Inline bytes must be `{ type: "data", data: <base64 string> }`.
//
// Shapes that fail on the wire (kept for the record):
//   - a bare string — remote schema ("expected object, received string")
//   - `{ type: "data", data: <Uint8Array> }` — the gateway's `maybeEncodeFileParts`
//     rewrites it to `{ type: "url", url: "data:..." }`, forwarded to Vertex as a
//     fileUri, which Google rejects
//   - `{ type: "url", url: "data:..." }` — same fileUri rejection
//
// Mastra's llmPrompt downloads `data:` URLs (gateway `supportedUrls` is https-only)
// into a Uint8Array before this middleware runs. We must untag that result too,
// not only the original string data-URL path.
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

function bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
  return Buffer.from(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  ).toString("base64");
}

function dataUrlFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("data:")) {
    return value;
  }
  if (value instanceof URL && value.protocol === "data:") {
    return value.toString();
  }
  return null;
}

function withMediaType(
  part: object,
  mediaType: string | undefined
): Record<string, unknown> {
  const record = part as { mediaType?: string };
  if (mediaType && !record.mediaType) {
    return { ...record, mediaType };
  }
  return record;
}

function taggedDataPart(
  part: object,
  data: { data: string; type: "data" } | { type: "url"; url: string },
  mediaType?: string
): unknown {
  return {
    ...withMediaType(part, mediaType),
    data,
  };
}

function normalizeTaggedData(part: object, tagged: object): unknown {
  const record = tagged as { data?: unknown; type?: unknown; url?: unknown };
  if (record.type === "data") {
    if (
      record.data instanceof Uint8Array ||
      record.data instanceof ArrayBuffer
    ) {
      return taggedDataPart(part, {
        data: bytesToBase64(record.data),
        type: "data",
      });
    }
    if (typeof record.data === "string") {
      const dataUrl = dataUrlFromUnknown(record.data);
      if (dataUrl) {
        const converted = toDiscriminatedData(dataUrl);
        return converted
          ? taggedDataPart(part, converted.data, converted.mediaType)
          : part;
      }
      // Already a base64 string — the wire shape we want.
      return part;
    }
    return part;
  }
  if (record.type === "url") {
    const dataUrl = dataUrlFromUnknown(record.url);
    if (!dataUrl) {
      return part;
    }
    const converted = toDiscriminatedData(dataUrl);
    return converted
      ? taggedDataPart(part, converted.data, converted.mediaType)
      : part;
  }
  return part;
}

export function normalizeGatewayFilePart(part: unknown): unknown {
  if (!part || typeof part !== "object") {
    return part;
  }
  const record = part as { data?: unknown; mediaType?: string; type?: string };
  if (record.type !== "file") {
    return part;
  }

  const { data } = record;
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return taggedDataPart(record, { data: bytesToBase64(data), type: "data" });
  }
  if (data instanceof URL) {
    const converted = toDiscriminatedData(data.toString());
    return converted
      ? taggedDataPart(record, converted.data, converted.mediaType)
      : part;
  }
  if (data && typeof data === "object") {
    return normalizeTaggedData(record, data);
  }
  if (typeof data !== "string") {
    return part;
  }
  const converted = toDiscriminatedData(data);
  if (!converted) {
    return part;
  }
  return taggedDataPart(record, converted.data, converted.mediaType);
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
        content: content.map((part) => normalizeGatewayFilePart(part)),
      };
    });
    return Promise.resolve({
      ...params,
      prompt: nextPrompt,
    } as typeof params);
  },
};
