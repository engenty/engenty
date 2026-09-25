"use client";

import {
  type AgentUiStateSnapshotV1,
  agentUiSharedStateSignature,
  isAgentUiStateSnapshotV1,
  type RunAgentInput,
} from "@engenty/ag-ui-bridge";
import { useEffect, useRef } from "react";
import type { EngentyAgUiEvent } from "./conversation.js";

/** Keeps AG-UI conversation shared state aligned with the app-shell UI snapshot. */
export function useSyncAgentUiRunState(params: {
  /** When false, skip live sync — submit reads the snapshot from a getter. */
  active?: boolean;
  applyEvent: (event: EngentyAgUiEvent) => void;
  getStateSnapshot?: () => RunAgentInput["state"] | undefined;
  stateSnapshot?: RunAgentInput["state"];
}): void {
  const lastSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (params.active === false) {
      return;
    }
    const raw = params.getStateSnapshot?.() ?? params.stateSnapshot;
    if (!isAgentUiStateSnapshotV1(raw)) {
      return;
    }
    const snapshot = raw as AgentUiStateSnapshotV1;
    const signature = agentUiSharedStateSignature(snapshot);
    if (lastSignatureRef.current === signature) {
      return;
    }
    lastSignatureRef.current = signature;
    params.applyEvent({
      type: "STATE_SNAPSHOT",
      snapshot,
    });
  }, [
    params.active,
    params.applyEvent,
    params.getStateSnapshot,
    params.stateSnapshot,
  ]);
}
