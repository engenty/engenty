import type {
  TaskContextInput,
  TaskDetail,
  TaskUpdateInput,
} from "../../src/schema/types.js";

const PROJECT_CONTEXT_TYPE = "project";

function contextInput(
  context: TaskDetail["contexts"][number]
): TaskContextInput {
  return {
    context_id: context.context_id,
    context_type: context.context_type,
    metadata: context.metadata,
  };
}

export function taskProjectPhaseId(task: TaskDetail): string | null {
  if (!task.project_id) {
    return null;
  }
  const projectContext = task.contexts.find(
    (context) =>
      context.context_type === PROJECT_CONTEXT_TYPE &&
      context.context_id === task.project_id
  );
  const phaseId = projectContext?.metadata.phase_id;
  return typeof phaseId === "string" && phaseId.length > 0 ? phaseId : null;
}

export function buildTaskLocationPatch(
  task: TaskDetail,
  location: {
    phaseId: string | null;
    projectId: string | null;
  }
): TaskUpdateInput {
  const contexts = task.contexts
    .filter((context) => context.context_type !== PROJECT_CONTEXT_TYPE)
    .map(contextInput);

  if (location.projectId) {
    const existingProjectContext = task.contexts.find(
      (context) =>
        context.context_type === PROJECT_CONTEXT_TYPE &&
        context.context_id === location.projectId
    );
    contexts.push({
      context_id: location.projectId,
      context_type: PROJECT_CONTEXT_TYPE,
      metadata: {
        ...(existingProjectContext?.metadata ?? {}),
        phase_id: location.phaseId,
      },
    });
  }

  return {
    contexts,
    project_id: location.projectId,
  };
}
