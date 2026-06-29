/**
 * CopilotKit-shaped tool row merge: one AG-UI `toolCallId` maps to one `dynamic-tool`
 * part in the lane adapter. (Legacy transcripts created before AG-UI-native frontend
 * tools used a separate browser dispatch `call_id` for the old `invoke_frontend_tool`
 * wrapper; native frontend tools use the Mastra tool-call id directly.)
 *
 * Precedence: completed beats a later client-side error; server replace (error → completed) wins.
 */

export type DynamicToolPartState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export interface MergeableDynamicToolPart {
  errorText?: string;
  input?: unknown;
  output?: unknown;
  progressLines?: string[];
  state?: string;
  toolCallId?: string;
  toolName?: string;
  type: string;
}

function normalizeState(state: unknown): DynamicToolPartState {
  if (
    state === "input-streaming" ||
    state === "input-available" ||
    state === "output-available" ||
    state === "output-error"
  ) {
    return state;
  }
  return "input-available";
}

function terminalRank(state: DynamicToolPartState): number {
  switch (state) {
    case "output-available":
      return 3;
    case "output-error":
      return 2;
    case "input-available":
      return 1;
    case "input-streaming":
      return 0;
  }
}

/** False when an existing completed row must not be overwritten by a stale error injection. */
export function shouldAcceptIncomingOverExisting(
  existing: MergeableDynamicToolPart,
  incoming: MergeableDynamicToolPart
): boolean {
  const existingState = normalizeState(existing.state);
  const incomingState = normalizeState(incoming.state);
  if (
    existingState === "output-available" &&
    incomingState === "output-error"
  ) {
    return false;
  }
  if (terminalRank(incomingState) >= terminalRank(existingState)) {
    return true;
  }
  return false;
}

function isFrontendDispatchToolCallId(toolCallId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    toolCallId
  );
}

function preferMergedToolCallId(
  existing: MergeableDynamicToolPart,
  incoming: MergeableDynamicToolPart
): string | undefined {
  const existingId = existing.toolCallId?.trim();
  const incomingId = incoming.toolCallId?.trim();
  const candidates = [existingId, incomingId].filter(Boolean) as string[];
  const dispatchUuid = candidates.find(isFrontendDispatchToolCallId);
  if (dispatchUuid) {
    return dispatchUuid;
  }
  const existingState = normalizeState(existing.state);
  const incomingState = normalizeState(incoming.state);
  if (terminalRank(incomingState) > terminalRank(existingState)) {
    return incomingId ?? existingId;
  }
  if (terminalRank(incomingState) < terminalRank(existingState)) {
    return existingId ?? incomingId;
  }
  return candidates[0];
}

function stableToolIntentKey(part: MergeableDynamicToolPart): string | null {
  const toolName = part.toolName?.trim();
  if (!toolName) {
    return null;
  }
  try {
    return `${toolName}:${JSON.stringify(part.input ?? {})}`;
  } catch {
    return `${toolName}:{}`;
  }
}

export function mergeDynamicToolPart<T extends MergeableDynamicToolPart>(
  existing: T,
  incoming: T
): T {
  if (!shouldAcceptIncomingOverExisting(existing, incoming)) {
    return existing;
  }
  const progressLines =
    existing.progressLines?.length && !incoming.progressLines?.length
      ? existing.progressLines
      : incoming.progressLines?.length
        ? incoming.progressLines
        : existing.progressLines;
  const merged: MergeableDynamicToolPart = {
    ...existing,
    ...incoming,
    input: incoming.input ?? existing.input,
    toolCallId: preferMergedToolCallId(existing, incoming),
    toolName: incoming.toolName ?? existing.toolName,
    state: normalizeState(incoming.state ?? existing.state),
    ...(progressLines?.length ? { progressLines } : {}),
  };
  if (incoming.state === "output-error" || existing.state === "output-error") {
    merged.errorText =
      incoming.errorText ??
      (typeof incoming.output === "string" ? incoming.output : undefined) ??
      existing.errorText;
  }
  if (incoming.output !== undefined) {
    merged.output = incoming.output;
  }
  return merged as T;
}

function mergeDynamicToolPartAtIndex<T extends MergeableDynamicToolPart>(
  merged: T[],
  index: number,
  incoming: T
) {
  merged[index] = mergeDynamicToolPart(merged[index] as T, incoming);
}

/** Preserve transcript order; collapse duplicate tool rows (by id, then tool+input intent). */
export function mergeDynamicToolPartsInOrder<
  T extends MergeableDynamicToolPart,
>(parts: readonly T[]): T[] {
  const merged: T[] = [];
  const indexByToolCallId = new Map<string, number>();
  const indexByIntent = new Map<string, number>();

  for (const part of parts) {
    if (part.type !== "dynamic-tool") {
      merged.push(part);
      continue;
    }
    const toolCallId = part.toolCallId?.trim();
    if (toolCallId) {
      const existingIndex = indexByToolCallId.get(toolCallId);
      if (existingIndex !== undefined) {
        mergeDynamicToolPartAtIndex(merged, existingIndex, part);
        continue;
      }
    }
    const intentKey = stableToolIntentKey(part);
    if (intentKey) {
      const intentIndex = indexByIntent.get(intentKey);
      if (intentIndex !== undefined) {
        mergeDynamicToolPartAtIndex(merged, intentIndex, part);
        const mergedId = merged[intentIndex]?.toolCallId?.trim();
        if (mergedId) {
          indexByToolCallId.set(mergedId, intentIndex);
        }
        continue;
      }
    }
    const nextIndex = merged.length;
    merged.push(part);
    if (toolCallId) {
      indexByToolCallId.set(toolCallId, nextIndex);
    }
    if (intentKey) {
      indexByIntent.set(intentKey, nextIndex);
    }
  }

  return merged;
}
