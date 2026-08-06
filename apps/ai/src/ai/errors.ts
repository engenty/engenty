export type AiSessionErrorCode =
  | "agent_threads.notFound"
  | "agent_threads.unknownAgentType"
  | "agent_threads.unknownTool"
  | "agent_threads.unconfiguredDatabase"
  | "agent_threads.missingUserInput"
  | "agent_threads.invalidSubmittedMessages"
  | "agent_threads.nativeMemoryUnavailable"
  | "agent_threads.usageLimitExceeded"
  | "agent_threads.invalidResume"
  | "agent_threads.interruptNotFound"
  | "agent_threads.interruptMismatch"
  | "agent_threads.interruptExpired"
  | "agent_threads.taskCheckoutConflict";

export class AiSessionError extends Error {
  readonly code: AiSessionErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AiSessionErrorCode,
    message: string = code,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AiSessionError";
    this.code = code;
    this.details = details;
  }
}
