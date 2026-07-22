/**
 * Structured file ops for chat attachments / vault keys.
 * Modes: read | summarize | ask | convert | extract
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getVaultFileStorageClient } from "../vault-files/lib/client.js";

export const ANALYZE_FILE_TOOL_ID = "analyze_file";

/** Cap tool-result payloads (house convention ~256 KiB). */
const MAX_RESULT_BYTES = 256 * 1024;
const MAX_ASK_HITS = 8;
const ASK_CONTEXT_CHARS = 280;

const modeSchema = z.enum(["read", "summarize", "ask", "convert", "extract"]);

export type AnalyzeFileMode = z.infer<typeof modeSchema>;

function isTextLike(mimeType: string, filename?: string): boolean {
  const mime = mimeType.toLowerCase();
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/csv" ||
    mime === "application/x-csv"
  ) {
    return true;
  }
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  return [
    "csv",
    "tsv",
    "txt",
    "md",
    "json",
    "xml",
    "yaml",
    "yml",
    "log",
  ].includes(ext);
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function clipText(
  text: string,
  maxBytes: number
): {
  text: string;
  truncated: boolean;
} {
  const encoded = Buffer.from(text, "utf8");
  if (encoded.byteLength <= maxBytes) {
    return { text, truncated: false };
  }
  return {
    text: encoded.subarray(0, maxBytes).toString("utf8"),
    truncated: true,
  };
}

function detectDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t", "|"] as const;
  let best: (typeof candidates)[number] = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function profileDelimited(text: string): {
  delimiter: string;
  headers: string[];
  row_count: number;
  sample_rows: string[][];
} {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { delimiter: ",", headers: [], row_count: 0, sample_rows: [] };
  }
  const delimiter = detectDelimiter(lines[0] ?? "");
  const split = (line: string) => line.split(delimiter).map((c) => c.trim());
  const headers = split(lines[0] ?? "");
  const dataLines = lines.slice(1);
  const sample_rows = dataLines.slice(0, 5).map(split);
  return {
    delimiter,
    headers,
    row_count: dataLines.length,
    sample_rows,
  };
}

function summarizeText(text: string, filename?: string, mimeType?: string) {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  const looksCsv =
    ext === "csv" ||
    ext === "tsv" ||
    mimeType === "text/csv" ||
    mimeType === "application/csv";

  if (looksCsv) {
    const profile = profileDelimited(text);
    return {
      kind: "csv" as const,
      line_count: lines.length,
      non_empty_line_count: nonEmpty.length,
      char_count: text.length,
      ...profile,
      head: nonEmpty.slice(0, 3),
    };
  }

  return {
    kind: "text" as const,
    line_count: lines.length,
    non_empty_line_count: nonEmpty.length,
    char_count: text.length,
    head: nonEmpty.slice(0, 8),
    tail: nonEmpty.slice(-4),
  };
}

function askInText(text: string, question: string) {
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9äöüß@_./-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) {
    return {
      hits: [] as Array<{ index: number; excerpt: string }>,
      note: "question_had_no_searchable_tokens",
    };
  }
  const lower = text.toLowerCase();
  const hits: Array<{ index: number; excerpt: string }> = [];
  for (const token of tokens) {
    let from = 0;
    while (hits.length < MAX_ASK_HITS) {
      const idx = lower.indexOf(token, from);
      if (idx < 0) {
        break;
      }
      const start = Math.max(0, idx - ASK_CONTEXT_CHARS / 2);
      const end = Math.min(
        text.length,
        idx + token.length + ASK_CONTEXT_CHARS / 2
      );
      hits.push({
        index: idx,
        excerpt: text.slice(start, end).replace(/\s+/g, " ").trim(),
      });
      from = idx + token.length;
    }
  }
  // Dedupe overlapping excerpts
  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    if (seen.has(h.excerpt)) {
      return false;
    }
    seen.add(h.excerpt);
    return true;
  });
  return {
    hits: unique.slice(0, MAX_ASK_HITS),
    tokens,
    note:
      unique.length === 0
        ? "no_literal_matches — reason over read/summarize results instead"
        : undefined,
  };
}

function extractFromText(text: string, filename?: string, mimeType?: string) {
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  const looksCsv =
    ext === "csv" ||
    ext === "tsv" ||
    mimeType === "text/csv" ||
    mimeType === "application/csv";
  if (looksCsv) {
    return { kind: "csv" as const, ...profileDelimited(text) };
  }
  // Key: value lines + markdown headings as a light extract
  const lines = text.split(/\r?\n/);
  const headings = lines
    .filter((l) => /^#{1,6}\s+\S/.test(l.trim()))
    .slice(0, 40)
    .map((l) => l.trim());
  const kv: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z][\w ./-]{1,40})\s*[:=]\s*(.+)\s*$/);
    if (m?.[1] && m[2] && Object.keys(kv).length < 40) {
      kv[m[1].trim()] = m[2].trim();
    }
  }
  const emails = [
    ...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
  ].map((m) => m[0]);
  return {
    kind: "text" as const,
    headings,
    key_values: kv,
    emails: [...new Set(emails)].slice(0, 30),
  };
}

async function tryConvertToMarkdown(
  bytes: Uint8Array,
  filename: string,
  mimeType: string
): Promise<
  | { ok: true; markdown: string; provider?: string }
  | { ok: false; error: string }
> {
  if (isTextLike(mimeType, filename)) {
    const text = decodeText(bytes);
    const clipped = clipText(text, MAX_RESULT_BYTES);
    const fence = filename.endsWith(".md") || mimeType.includes("markdown");
    return {
      ok: true,
      markdown: fence
        ? clipped.text
        : `\`\`\`\n${clipped.text}${clipped.truncated ? "\n…(truncated)" : ""}\n\`\`\``,
      provider: "text",
    };
  }
  try {
    const { Converter } = await import("@engenty/doc-converter");
    const converter = new Converter({ provider: "local" });
    const result = await converter.convert(bytes, filename, mimeType, {});
    const markdown = result.markdown ?? "";
    const clipped = clipText(markdown, MAX_RESULT_BYTES);
    return {
      ok: true,
      markdown: clipped.truncated
        ? `${clipped.text}\n\n…(truncated)`
        : clipped.text,
      provider: "doc-converter",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "convert_failed_or_unsupported_type",
    };
  }
}

export const analyzeFileTool = createTool({
  id: ANALYZE_FILE_TOOL_ID,
  description:
    "Read, summarize, ask over, convert, or extract structured info from a tenant vault / chat-attachment file by storage key. Prefer this for CSV/TXT/JSON and office docs; pass the storage_key from the user_attachments context.",
  inputSchema: z.object({
    key: z
      .string()
      .min(1)
      .describe("Vault object key (chat attachment storage_key)"),
    mode: modeSchema.describe(
      "read = raw text; summarize = profile/stats; ask = keyword excerpts for a question; convert = markdown; extract = headers/tables/kv/emails"
    ),
    question: z
      .string()
      .optional()
      .describe("Required for mode=ask — what to look for in the file"),
    max_bytes: z
      .number()
      .int()
      .min(1024)
      .max(MAX_RESULT_BYTES)
      .optional()
      .describe("Optional read/convert size cap (default 256KiB)"),
  }),
  execute: async (input, context) => {
    const { key, mode } = input as {
      key: string;
      mode: AnalyzeFileMode;
      question?: string;
      max_bytes?: number;
    };
    const question = (input as { question?: string }).question;
    const maxBytes =
      (input as { max_bytes?: number }).max_bytes ?? MAX_RESULT_BYTES;

    const resolved = await getVaultFileStorageClient(context);
    if (!resolved.ok) {
      return resolved;
    }

    try {
      const scopedKey = resolved.resolveKey(key);
      const bytes = await resolved.client.download(scopedKey);
      if (!bytes) {
        return { ok: false, error: "file_not_found", key: scopedKey };
      }

      const filename = scopedKey.split("/").pop() ?? "file";
      // Best-effort mime from extension when vault metadata is absent
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const mimeGuess =
        ext === "csv"
          ? "text/csv"
          : ext === "json"
            ? "application/json"
            : ext === "pdf"
              ? "application/pdf"
              : ext === "md"
                ? "text/markdown"
                : "application/octet-stream";

      if (mode === "convert") {
        const converted = await tryConvertToMarkdown(
          bytes,
          filename,
          mimeGuess
        );
        if (!converted.ok) {
          return {
            ok: false,
            key: scopedKey,
            mode,
            error: converted.error,
            size_bytes: bytes.byteLength,
          };
        }
        return {
          ok: true,
          key: scopedKey,
          mode,
          size_bytes: bytes.byteLength,
          markdown: converted.markdown,
          provider: converted.provider,
        };
      }

      if (!(isTextLike(mimeGuess, filename) || mode === "read")) {
        return {
          ok: false,
          key: scopedKey,
          mode,
          error:
            "not_text_like — use mode=convert for office/PDF, or engenty_cli for binary processing",
          size_bytes: bytes.byteLength,
        };
      }

      const fullText = decodeText(bytes);
      const clipped = clipText(fullText, maxBytes);

      if (mode === "read") {
        return {
          ok: true,
          key: scopedKey,
          mode,
          size_bytes: bytes.byteLength,
          encoding: "utf8",
          truncated: clipped.truncated,
          content: clipped.text,
        };
      }

      if (mode === "summarize") {
        return {
          ok: true,
          key: scopedKey,
          mode,
          size_bytes: bytes.byteLength,
          truncated: clipped.truncated,
          summary: summarizeText(clipped.text, filename, mimeGuess),
        };
      }

      if (mode === "ask") {
        if (!question?.trim()) {
          return {
            ok: false,
            key: scopedKey,
            mode,
            error: "question_required_for_ask",
          };
        }
        return {
          ok: true,
          key: scopedKey,
          mode,
          size_bytes: bytes.byteLength,
          truncated: clipped.truncated,
          question: question.trim(),
          ...askInText(clipped.text, question.trim()),
        };
      }

      // extract
      return {
        ok: true,
        key: scopedKey,
        mode,
        size_bytes: bytes.byteLength,
        truncated: clipped.truncated,
        extracted: extractFromText(clipped.text, filename, mimeGuess),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
