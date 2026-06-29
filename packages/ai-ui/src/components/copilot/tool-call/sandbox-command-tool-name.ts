// Mastra workspace sandbox execute tool id (`WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND`).
export const SANDBOX_EXECUTE_COMMAND_TOOL_NAME =
  "mastra_workspace_execute_command";

export function isSandboxExecuteCommandToolName(toolName: string): boolean {
  return toolName === SANDBOX_EXECUTE_COMMAND_TOOL_NAME;
}
