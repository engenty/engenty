import {
  type AGUIEvent,
  trajectoryTranscript as bridgeTrajectoryTranscript,
  buildInspectorTrajectory as buildBridgeInspectorTrajectory,
  type TrajectoryCellKind,
  type TrajectoryRow,
  type TrajectorySpeechMessage,
} from "@engenty/ag-ui-bridge";
import type { EngentyAgUiMessage } from "../../ag-ui/conversation.js";

export type InspectorTrajectoryRow = TrajectoryRow;
export type InspectorTrajectoryCellKind = TrajectoryCellKind;

/**
 * Fold the AG-UI wire stream into a Trajectory-style ledger. The pure
 * projector lives in `@engenty/ag-ui-bridge` so Manage can fold the same
 * durable events without depending on `@engenty/ai-ui`.
 */
export function buildInspectorTrajectory(
  events: readonly AGUIEvent[],
  messages:
    | readonly EngentyAgUiMessage[]
    | readonly TrajectorySpeechMessage[] = []
): InspectorTrajectoryRow[] {
  return buildBridgeInspectorTrajectory(events, messages);
}

export function trajectoryTranscript(
  rows: readonly InspectorTrajectoryRow[]
): string {
  return bridgeTrajectoryTranscript(rows);
}
