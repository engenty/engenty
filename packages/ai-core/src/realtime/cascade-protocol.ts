/**
 * Wire protocol for the server-brokered voice cascade (browser ⇄ apps/ai WS).
 * JSON messages with base64 audio payloads — simple and debuggable; binary
 * frames are a latency optimization for later. Shared by the apps/ai broker
 * and the ai-ui cascade transport (browser-safe, no Node imports).
 */

export interface CascadeToolCall {
  arguments: unknown;
  call_id: string;
  name: string;
}

/** Client → server. */
export type CascadeClientMessage =
  | { type: "audio"; audio: string }
  | { type: "mute"; muted: boolean }
  | { type: "tool-output"; call_id: string; output: unknown };

/** Server → client. */
export type CascadeServerMessage =
  | { type: "audio"; audio: string; done?: boolean }
  | { type: "error"; message: string }
  | { type: "speech-started" }
  | { type: "status"; status: "listening" | "speaking" }
  | { type: "tool-call"; calls: readonly CascadeToolCall[] }
  | {
      type: "transcript";
      done?: boolean;
      item_id?: string;
      mode: "append" | "replace";
      role: "assistant" | "user";
      text: string;
    };

export function parseCascadeMessage<T>(raw: unknown): T | null {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      typeof (parsed as { type: unknown }).type === "string"
    ) {
      return parsed as T;
    }
    return null;
  } catch {
    return null;
  }
}
