// Pressing a wizard `/command` from a composer.
//
// The command's declared args map onto the workflow's input the same way the
// server maps them for a chat-invoked command — one shared pure function, so
// a `<contact>` arg picked from the `@` menu lands in the same field either
// way. The press itself is the plain run route; what happens next is the
// host's: a desk docks the run's first step, a drawer opens its page.

import { chatCommandArgsToWorkflowInput } from "@engenty/ai-core/browser";
import type { ChatReferenceItem } from "../../lib/chat-reference-part.js";
import {
  type RunWorkflowResponse,
  runWorkflow,
} from "../workflow-canvas/workflow-api.js";

export interface PressWizardCommandInput {
  argsText: string;
  /** The command row as the composer knows it — its declared args, if any. */
  command: {
    args?: Array<{
      name: string;
      ref_entity?: string;
      type: "enum" | "ref" | "string";
    }>;
    command: string;
  };
  refs: readonly ChatReferenceItem[];
  /** Fallback space claim for callers that cannot set the space header. */
  spaceId?: string | null;
  /** The stored workflow uuid the command presses. */
  workflowId: string;
}

export function pressWizardCommand(
  input: PressWizardCommandInput
): Promise<RunWorkflowResponse> {
  const workflowInput = chatCommandArgsToWorkflowInput({
    argsText: input.argsText,
    command: input.command,
    refs: input.refs,
  });
  return runWorkflow(input.workflowId, {
    input: workflowInput,
    ...(input.spaceId ? { space_id: input.spaceId } : {}),
    trigger: "command",
  });
}
