// A routine is created and edited by asking, not in a form (Grok's "just
// ask"): these put the start of that request into the desk's composer and
// focus it, and the person finishes the sentence. An edit names the routine
// as a reference pill, so the agent changes that routine by id — never a
// guess from its title.
import { setCopilotComposerDraft } from "../../copilot/copilot-composer-draft-intent.js";
import type { RoutineDto } from "./routines-api.js";

type Translate = (key: string, options: Record<string, unknown>) => string;

/** Ask the desk's Engenty to change this routine. */
export function editRoutineInChat(
  hostKey: string,
  routine: Pick<RoutineDto, "id" | "name">,
  t: Translate
): void {
  const mention = `@${routine.name}`;
  setCopilotComposerDraft(
    hostKey,
    t("agentDesk.routineChat.edit", {
      defaultValue: "Change the routine {{mention}}: ",
      mention,
    }),
    [
      {
        entity: "routine",
        label: routine.name,
        ref: `ai:routine:${routine.id}`,
      },
    ]
  );
}

/** Ask the desk's Engenty to set up a new routine. */
export function createRoutineInChat(hostKey: string, t: Translate): void {
  setCopilotComposerDraft(
    hostKey,
    t("agentDesk.routineChat.create", {
      defaultValue: "Set up a new routine: ",
    })
  );
}
