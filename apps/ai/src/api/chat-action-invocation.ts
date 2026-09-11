import type {
  ChatCommandDefinition,
  DynamicAiModuleCapabilityLoader,
} from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import type {
  ChatActionInvocationResult,
  ChatTurnReferenceItem,
} from "../ai/chat-commands.js";
import { resolveWorkflowById } from "../ai/module-workflows.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { assertFlowInput } from "../ai/workflows/flow-input.js";
import { pressWorkflow } from "./workflow-press.js";

function referenceId(ref: string): string {
  return ref.split(":").at(-1)?.trim() ?? ref;
}

function workflowInputFromCommand(input: {
  argsText: string;
  command: ChatCommandDefinition;
  refs: readonly ChatTurnReferenceItem[];
}): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const args = input.command.args ?? [];
  const textual = args.filter((arg) => arg.type !== "ref");
  for (const arg of args) {
    if (arg.type === "ref") {
      const match = input.refs.find(
        (ref) => !arg.ref_entity || ref.entity === arg.ref_entity
      );
      if (match) {
        result[arg.name] = referenceId(match.ref);
      }
    } else if (textual.length === 1 && input.argsText) {
      result[arg.name] = input.argsText;
    }
  }
  return result;
}

export async function invokeChatAction(input: {
  argsText: string;
  command: ChatCommandDefinition;
  idempotencyKey: string;
  mastra: Mastra;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  refs: readonly ChatTurnReferenceItem[];
  scope: AiSessionScope;
  spaceId?: string | null;
}): Promise<ChatActionInvocationResult> {
  const workflowId = input.command.workflow_id?.trim();
  if (!workflowId) {
    throw new Error(`chat action /${input.command.command} has no workflow_id`);
  }
  const action = await resolveWorkflowById(workflowId, input.moduleLoader);
  if (!action) {
    throw new Error(`chat action ${workflowId} names no module workflow`);
  }
  const commandInput = workflowInputFromCommand(input);
  try {
    assertFlowInput(action.definition.inputSchema, commandInput);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `chat action ${workflowId} input is incomplete: ${message}`
    );
  }
  const subject = input.refs[0];
  const pressed = await pressWorkflow({
    action,
    context: {
      contextId: subject ? referenceId(subject.ref) : null,
      contextType: subject?.entity ?? null,
    },
    idempotencyKey: input.idempotencyKey,
    input: commandInput,
    mastra: input.mastra,
    scope: input.scope,
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    trigger: "command",
  });
  return { deduped: pressed.deduped, runId: pressed.runId };
}
