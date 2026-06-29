/**
 * Colocated agent-app context (Enhancing Copilot Ch.7). Contribute a described,
 * read-only context slice so the agent knows what the user is looking at — the
 * read-only sibling of shared state (context describes; state is mutable).
 *
 *   useEngentyAgentContext({
 *     description: "The document the user is currently editing",
 *     value: { id: doc.id, title: doc.title, status: doc.status },
 *   });
 *
 * No new transport: it registers an `app_context` slice on the existing
 * AgentUiStateSnapshotV1, auto-cleaned on unmount, rendered by the harness as
 * `- {description}: {value}`.
 */
import type { JsonValue } from "@engenty/ag-ui-bridge";
import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import { useId } from "react";

export interface EngentyAgentContextConfig {
  /** Natural-language description of what `value` is, for the model. */
  description: string;
  value: JsonValue;
}

export function useEngentyAgentContext(
  config: EngentyAgentContextConfig
): void {
  // A per-call-site id keeps slices distinct so multiple contexts accumulate.
  const id = useId();
  useRegisterAgentUiSlice(`agent-context:${id}`, {
    app_context: [{ description: config.description, value: config.value }],
  });
}
