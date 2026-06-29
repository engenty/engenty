// Format sub-agent delegation input/output for inline card + full-page monitor.

export type SubAgentCollapsedPreviewTone = "default" | "error";

function readFirstPreviewLine(text: string): string {
  const firstLine = text.split(/\r?\n/)[0]?.trim();
  return firstLine || text.trim();
}

export function readSubAgentInputPreviewLine(
  inputText: string | null
): string | null {
  if (!inputText) {
    return null;
  }
  return readFirstPreviewLine(inputText);
}

export function readSubAgentOutputSummary(output: unknown): string | null {
  if (output === undefined || output === null) {
    return null;
  }
  if (typeof output === "string" && output.trim()) {
    return readFirstPreviewLine(output.trim());
  }
  if (typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const record = output as Record<string, unknown>;
  const summary =
    typeof record.summary === "string" ? record.summary.trim() : "";
  if (summary) {
    return readFirstPreviewLine(summary);
  }
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (text) {
    return readFirstPreviewLine(text);
  }
  return null;
}

export function readSubAgentOutputError(output: unknown): string | null {
  if (typeof output === "string" && output.trim()) {
    return readFirstPreviewLine(output.trim());
  }
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const record = output as Record<string, unknown>;
  const explicit =
    record.error ?? record.message ?? record.stderr_excerpt ?? record.summary;
  if (typeof explicit === "string" && explicit.trim()) {
    return readFirstPreviewLine(explicit.trim());
  }
  return null;
}

export function resolveSubAgentCollapsedPreview(args: {
  errorText?: string;
  input: unknown;
  output: unknown;
  state: "completed" | "error" | "pending" | "running";
}): { text: string; tone: SubAgentCollapsedPreviewTone } {
  const { errorText, input, output, state } = args;

  if (state === "error") {
    const message =
      errorText?.trim() ||
      readSubAgentOutputError(output) ||
      "Delegation failed";
    return { text: readFirstPreviewLine(message), tone: "error" };
  }

  if (state === "completed") {
    const summary = readSubAgentOutputSummary(output);
    if (summary) {
      return { text: summary, tone: "default" };
    }
  }

  const inputLine = readSubAgentInputPreviewLine(
    formatSubAgentInputText(input)
  );
  return { text: inputLine ?? "No input yet.", tone: "default" };
}

export function readSubAgentInputTask(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const task =
    record.task ??
    record.prompt ??
    record.message ??
    record.instructions ??
    record.request;
  return typeof task === "string" && task.trim() ? task.trim() : null;
}

export function formatSubAgentInputText(input: unknown): string | null {
  const task = readSubAgentInputTask(input);
  if (task) {
    return task;
  }
  if (input === undefined || input === null) {
    return null;
  }
  if (typeof input === "string" && input.trim()) {
    return input.trim();
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function formatSubAgentOutputText(output: unknown): string | null {
  if (output === undefined || output === null) {
    return null;
  }
  if (typeof output === "string" && output.trim()) {
    return output.trim();
  }
  if (typeof output !== "object" || Array.isArray(output)) {
    return String(output);
  }
  const record = output as Record<string, unknown>;
  const chunks: string[] = [];
  const summary =
    typeof record.summary === "string" ? record.summary.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const stderr =
    typeof record.stderr_excerpt === "string"
      ? record.stderr_excerpt.trim()
      : "";
  const status = typeof record.status === "string" ? record.status.trim() : "";

  if (summary) {
    chunks.push(summary);
  }
  if (text && text !== summary) {
    chunks.push(text);
  }
  if (stderr) {
    chunks.push(`stderr:\n${stderr}`);
  }
  if (status) {
    chunks.push(`status: ${status}`);
  }
  if (chunks.length > 0) {
    return chunks.join("\n\n");
  }
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}
