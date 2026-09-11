// The ONE boundary translation (PLAN-mounted-engentys, target model): a
// definition may use Mastra's native `{type:"agent", agentId}` entries, and
// the save/reconcile path rewrites each into `mapping + run_specialist` —
// per-tenant assembly, space gate, HITL park/resume, self-tools and model
// config all live behind that primitive. Invertible by construction (the
// mapping carries a marker), and becomes the identity if Mastra ever accepts
// dynamic agent registries. Nothing else touches the JSON.
import { RUN_SPECIALIST_PRIMITIVE_ID } from "./primitive-ids.js";

/** Marker key the translation stamps so a viewer can render the entry back. */
export const AGENT_ENTRY_MARKER = "__engenty_agent_entry";

export function translateAgentEntries(
  graph: Record<string, unknown>[]
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const entry of graph) {
    if (entry.type !== "agent") {
      // Containers hold nested graphs; translate them in place.
      if (Array.isArray(entry.steps)) {
        out.push({
          ...entry,
          steps: translateAgentEntries(
            entry.steps as Record<string, unknown>[]
          ),
        });
        continue;
      }
      out.push(entry);
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id : "agent";
    const agentId = typeof entry.agentId === "string" ? entry.agentId : "";
    const mapConfig: Record<string, unknown> = {
      [AGENT_ENTRY_MARKER]: { value: { agentId, id } },
      agent_type_key: { value: agentId },
      // Mastra's agent entry prompts with the previous step's output; the
      // whole run input rides along as structured context.
      brief: { path: "" },
      input: { initData: true, path: "" },
      // Pinned, against the primitive's own default: a Mastra agent chain is
      // defined to prompt each step with the previous one's output, and this
      // translation exists to preserve those semantics rather than improve on
      // them. An engenty-authored graph gets the isolating default instead.
      thread_mode: { value: "reuse" },
      ...(entry.outputSchema && typeof entry.outputSchema === "object"
        ? { output_schema: { value: entry.outputSchema } }
        : {}),
    };
    out.push({
      id: `${id}__prepare`,
      mapConfig: JSON.stringify(mapConfig),
      type: "mapping",
    });
    out.push({ id, toolId: RUN_SPECIALIST_PRIMITIVE_ID, type: "tool" });
  }
  return out;
}
