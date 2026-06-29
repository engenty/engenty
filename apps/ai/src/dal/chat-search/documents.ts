import { compactSearchText, createSearchChunks } from "@engenty/search-index";
import type {
  AgentSessionMessageRow,
  AgentSessionRow,
} from "../agent-sessions/index.js";
import type {
  AiChatSearchDocument,
  SearchableAgentSessionMessageRow,
} from "./types.js";

function messagePartsToText(parts: unknown): string {
  if (typeof parts === "string") {
    return parts.trim();
  }
  if (Array.isArray(parts)) {
    return parts
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text.trim() : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (parts && typeof parts === "object") {
    const text = (parts as { text?: unknown }).text;
    if (typeof text === "string") {
      return text.trim();
    }
    return JSON.stringify(parts);
  }
  return "";
}

function isSearchableMessage(
  message: AgentSessionMessageRow
): message is SearchableAgentSessionMessageRow {
  return (
    message.role === "assistant" ||
    message.role === "system" ||
    message.role === "user"
  );
}

function buildBaseDocument(params: {
  docId: string;
  session: AgentSessionRow;
  sourceCreatedAt: string | null;
  sourceId: string;
  sourceType: string;
  sourceUpdatedAt: string;
  text: string;
  type: AiChatSearchDocument["document_type"];
}): AiChatSearchDocument {
  const {
    docId,
    session,
    sourceCreatedAt,
    sourceId,
    sourceType,
    sourceUpdatedAt,
    text,
    type,
  } = params;
  return {
    agent_id: session.agent_id,
    chunks: createSearchChunks({ doc_id: docId, text }),
    doc_id: docId,
    document_type: type,
    metadata: {},
    route_context: session.route_context,
    scope_id: null,
    thread_id: session.id,
    session_status: session.status,
    source_created_at: sourceCreatedAt,
    source_id: sourceId,
    source_type: sourceType,
    source_updated_at: sourceUpdatedAt,
    tenant_id: session.tenant_id,
    text,
    user_id: session.created_by_user_id,
    workspace_key: session.workspace_key,
  };
}

export function buildAiChatSearchDocumentsForSession(
  session: AgentSessionRow,
  messages: AgentSessionMessageRow[]
): AiChatSearchDocument[] {
  const searchableMessages = messages
    .filter(isSearchableMessage)
    .map((message) => ({
      ...message,
      text: messagePartsToText(message.parts),
    }))
    .filter((message) => message.text.length > 0);
  const transcript = searchableMessages
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n\n");
  const sessionText = compactSearchText([
    session.title,
    session.summary,
    transcript,
  ]);
  const documents: AiChatSearchDocument[] = [];
  if (sessionText) {
    const docId = `ai-chat-session:${session.id}`;
    documents.push(
      buildBaseDocument({
        docId,
        session,
        sourceCreatedAt: session.created_at,
        sourceId: session.id,
        sourceType: "ai_chat_session",
        sourceUpdatedAt: session.updated_at,
        text: sessionText,
        type: "session",
      })
    );
  }
  for (const message of searchableMessages) {
    const docId = `ai-chat-message:${session.id}:${message.id}`;
    documents.push({
      ...buildBaseDocument({
        docId,
        session,
        sourceCreatedAt: message.created_at,
        sourceId: message.id,
        sourceType: "ai_chat_message",
        sourceUpdatedAt: message.created_at,
        text: message.text,
        type: "message",
      }),
      metadata: {
        message_id: message.id,
      },
      role: message.role,
    });
  }
  return documents;
}
