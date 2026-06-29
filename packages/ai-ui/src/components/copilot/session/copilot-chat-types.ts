import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";

/** Copilot turn finished — AG-UI / transcript message shape (not AI SDK). */
export type CopilotChatOnFinish = (event: {
  message: AgentTurnMessageLike;
  messages: AgentTurnMessageLike[];
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
  finishReason?: unknown;
}) => void;
