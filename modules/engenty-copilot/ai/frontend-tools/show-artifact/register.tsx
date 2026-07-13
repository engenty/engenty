import {
  activateArtifact,
  ENGENTY_COPILOT_HOST_KEY,
  useEngentyFrontendTool,
} from "@engenty/ai-ui";
import { SHOW_ARTIFACT_SPEC } from "./definition.js";

export function useRegisterShowArtifactFrontendTool(): void {
  useEngentyFrontendTool({
    ...SHOW_ARTIFACT_SPEC,
    handler: (input) => {
      const { artifact_id } = SHOW_ARTIFACT_SPEC.schema.parse(input);
      // Opens the artifact pane (activateArtifact sets paneOpen) and selects
      // the tab. If the artifact is not in the current list yet (just created,
      // realtime pending), auto-open reconciles it once the list refetches.
      activateArtifact(ENGENTY_COPILOT_HOST_KEY, artifact_id);
      return { ok: true };
    },
  });
}
