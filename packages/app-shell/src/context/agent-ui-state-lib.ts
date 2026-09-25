import type {
  EngentyFrontendToolMetadata,
  FrontendToolDefinition,
} from "@engenty/ag-ui-bridge";
import type { AgentUiStateSlice } from "./agent-ui-state-slices";

export function createSnapshotId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-ui-${Date.now()}`;
}

export function mergeSlices(
  slices: Map<string, AgentUiStateSlice>
): AgentUiStateSlice {
  const merged: AgentUiStateSlice = {};
  for (const slice of slices.values()) {
    if (!slice) {
      continue;
    }
    if (slice.app_context) {
      merged.app_context = [
        ...(merged.app_context ?? []),
        ...slice.app_context,
      ];
    }
    if (slice.page) {
      merged.page = { ...(merged.page ?? {}), ...slice.page };
    }
    if (slice.shared) {
      merged.shared = { ...(merged.shared ?? {}), ...slice.shared };
    }
    if (slice.selection) {
      merged.selection = { ...(merged.selection ?? {}), ...slice.selection };
    }
    if (slice.draft) {
      merged.draft = {
        ...(merged.draft ?? { dirty: false }),
        ...slice.draft,
        fields: {
          ...(merged.draft?.fields ?? {}),
          ...(slice.draft.fields ?? {}),
        },
      };
    }
  }
  return merged;
}

export function getFrontendToolMetadata(
  tool: FrontendToolDefinition
): EngentyFrontendToolMetadata {
  return tool.metadata.engenty;
}
