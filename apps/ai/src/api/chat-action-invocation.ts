import {
  type ChatCommandDefinition,
  chatCommandArgsToWorkflowInput,
  type DynamicAiModuleCapabilityLoader,
} from "@engenty/ai-core";
import type { Mastra } from "@mastra/core/mastra";
import type {
  ChatActionInvocationResult,
  ChatTurnReferenceItem,
} from "../ai/chat-commands.js";
import { createWorkflowStoreFromEnv } from "../ai/index.js";
import { resolveWorkflowById } from "../ai/module-workflows.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { dispatchPublishedWorkflowRun } from "../ai/workflows/dispatch-published-run.js";
import { assertFlowInput } from "../ai/workflows/flow-input.js";
import { pressWorkflow } from "./workflow-press.js";

function referenceId(ref: string): string {
  return ref.split(":").at(-1)?.trim() ?? ref;
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
  const commandInput = chatCommandArgsToWorkflowInput(input);
  const subject = input.refs[0];
  if (input.command.surface === "wizard") {
    // A wizard names a STORED workflow: the run starts on that row, the same
    // way the run-now route and the client's own press do.
    const store = createWorkflowStoreFromEnv();
    const current = store
      ? await store.getCurrent({
          id: workflowId,
          tenantId: input.scope.tenantId,
        })
      : null;
    if (current?.graph.status !== "active") {
      throw new Error(`wizard ${workflowId} has no published version`);
    }
    const dispatched = await dispatchPublishedWorkflowRun({
      workflowId,
      context: {
        contextId: subject ? referenceId(subject.ref) : null,
        contextType: subject?.entity ?? null,
      },
      current,
      idempotencyKey: input.idempotencyKey,
      input: commandInput,
      scope: input.scope,
      ...(input.spaceId ? { spaceId: input.spaceId } : {}),
      trigger: "command",
    });
    return { deduped: dispatched.deduped, runId: dispatched.runId };
  }
  const action = await resolveWorkflowById(workflowId, input.moduleLoader);
  if (!action) {
    throw new Error(`chat action ${workflowId} names no module workflow`);
  }
  try {
    assertFlowInput(action.definition.inputSchema, commandInput);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `chat action ${workflowId} input is incomplete: ${message}`
    );
  }
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
