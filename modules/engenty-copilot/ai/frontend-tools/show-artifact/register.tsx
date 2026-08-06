import {
  activateArtifact,
  ENGENTY_COPILOT_HOST_KEY,
  useCopilotThreadBinding,
  useEngentyFrontendTool,
} from "@engenty/ai-ui";
import {
  resolveEngentyAiServiceBaseUrl,
  updateAppsAiThread,
} from "@engenty/ai-ui/embed";
import { useRef } from "react";
import { SHOW_ARTIFACT_SPEC } from "./definition.js";

export function useRegisterShowArtifactFrontendTool(): void {
  const { activeThreadId } = useCopilotThreadBinding();
  const threadIdRef = useRef(activeThreadId);
  threadIdRef.current = activeThreadId;

  useEngentyFrontendTool({
    ...SHOW_ARTIFACT_SPEC,
    handler: (input) => {
      const { artifact_id } = SHOW_ARTIFACT_SPEC.schema.parse(input);
      // Opens the artifact pane (activateArtifact sets paneOpen) and selects
      // the tab. If the artifact is not in the current list yet (just created,
      // realtime pending), auto-open reconciles it once the list refetches.
      activateArtifact(ENGENTY_COPILOT_HOST_KEY, artifact_id);
      // Persist which artifact is presented so every OTHER window attached to
      // this thread follows (badge or auto-focus, per its own pane state) —
      // fire-and-forget: this window already updated instantly above, and a
      // failed sync here just means other windows miss this one echo, not a
      // broken interaction.
      const threadId = threadIdRef.current?.trim();
      const serviceBaseUrl = resolveEngentyAiServiceBaseUrl();
      if (threadId && serviceBaseUrl) {
        void updateAppsAiThread({
          activeArtifactId: artifact_id,
          serviceBaseUrl,
          threadId,
        }).catch(() => {
          // Best-effort — see comment above.
        });
      }
      return { ok: true };
    },
  });
}
