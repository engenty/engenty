import type { ObjectRef } from "@engenty/ai-core/browser";
import type { TaskContext } from "../../src/schema/types.js";

const CONTEXT_TYPE_ALIASES: Record<
  string,
  Pick<ObjectRef, "entity" | "module">
> = {
  contact: { entity: "contact", module: "contacts" },
};

/** Map durable task links onto the same canonical object identity chat uses. */
export function taskContextObjectRef(
  context: Pick<TaskContext, "context_id" | "context_type">
): ObjectRef | null {
  const contextType = context.context_type.trim();
  const id = context.context_id.trim();
  if (!(contextType && id) || contextType === "project") {
    return null;
  }
  const alias = CONTEXT_TYPE_ALIASES[contextType];
  if (alias) {
    return { ...alias, id };
  }
  const separator = contextType.includes(".") ? "." : ":";
  const [module, entity, ...rest] = contextType.split(separator);
  if (!(module && entity) || rest.length > 0) {
    return null;
  }
  return { entity, id, module };
}
