"use client";

import { cn } from "@engenty/ui-core";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../../components/presentation.js";

function collectDisplayTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  const chunks: string[] = [];
  for (const p of parts) {
    if (!p || typeof p !== "object") {
      continue;
    }
    const o = p as Record<string, unknown>;
    const typ = o.type;
    if (typ === "text" && typeof o.text === "string") {
      chunks.push(o.text);
    } else if (typ === "reasoning" && typeof o.text === "string") {
      chunks.push(o.text);
    } else if (
      typ === "tool-invocation" ||
      typ === "dynamic-tool" ||
      typ === "tool-call"
    ) {
      const name =
        typeof o.toolName === "string"
          ? o.toolName
          : typeof o.toolCallId === "string"
            ? o.toolCallId
            : "tool";
      chunks.push(`[${name}]`);
    }
  }
  return chunks.join("\n\n").trim();
}

function normalizeRow(raw: Record<string, unknown>): {
  body: string;
  id: string;
  role: "assistant" | "system" | "user";
} | null {
  const role = raw.role;
  if (role !== "user" && role !== "assistant" && role !== "system") {
    return null;
  }
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : "msg";
  const fromParts = collectDisplayTextFromParts(raw.parts);
  const fromContent = typeof raw.content === "string" ? raw.content.trim() : "";
  const body = (fromParts || fromContent).trim();
  if (!body) {
    return null;
  }
  return { body, id, role };
}

interface ThreadTranscriptMessagesProps {
  isLoading: boolean;
  messages: Record<string, unknown>[] | null | undefined;
  t: (key: string) => string;
}

export function ThreadTranscriptMessages({
  isLoading,
  messages,
  t,
}: ThreadTranscriptMessagesProps) {
  if (isLoading) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("sessions.transcriptLoading")}
      </p>
    );
  }

  const rows =
    messages?.map((m) => normalizeRow(m)).filter((row) => row != null) ?? [];

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("sessions.transcriptEmpty")}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex max-h-[min(36rem,75vh)] flex-col gap-4 overflow-y-auto rounded-lg border bg-muted/15 p-4"
      )}
    >
      {rows.map((row) => (
        <Message
          className={cn(row.role === "user" && "ml-auto")}
          from={row.role}
          key={row.id}
        >
          <MessageContent>
            {row.role === "assistant" ? (
              <MessageResponse>{row.body}</MessageResponse>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{row.body}</p>
            )}
          </MessageContent>
        </Message>
      ))}
    </div>
  );
}
