export interface AwaitingFrontendToolConfirmationOutput {
  call_id: string;
  input?: unknown;
  status: "awaiting_confirmation";
  tool_name: string;
}

export function isAwaitingFrontendToolConfirmationOutput(
  value: unknown
): value is AwaitingFrontendToolConfirmationOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.status === "awaiting_confirmation" &&
    typeof record.call_id === "string" &&
    typeof record.tool_name === "string"
  );
}

export function matchesFrontendToolConfirmationOutput(
  output: unknown
): boolean {
  return isAwaitingFrontendToolConfirmationOutput(output);
}
