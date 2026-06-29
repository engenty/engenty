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
  applyEvent: (event: EngentyAgUiEvent) => void;
  stateSnapshot?: RunAgentInput["state"];
}): void {
  const lastSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAgentUiStateSnapshotV1(params.stateSnapshot)) {
      return;
    }
    const snapshot = params.stateSnapshot as AgentUiStateSnapshotV1;
    const signature = agentUiSharedStateSignature(snapshot);
    if (lastSignatureRef.current === signature) {
      return;
    }
    lastSignatureRef.current = signature;
    params.applyEvent({
      type: "STATE_SNAPSHOT",
      snapshot,
    });
  }, [params.applyEvent, params.stateSnapshot]);
}
