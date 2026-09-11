// A row in the conversation the person is watching, saying an App version is
// built and waiting for them to activate it.
//
// The build itself usually happens somewhere else: a colleague picks up the
// job over `message_agent` and calls `app_build` in its own run, so the chat
// the human is reading never sees the tool call — only the preview artifact,
// which carries the Approve/Reject banner but is out of the transcript. The
// marker puts that banner back in the conversation, at the point in it where
// the version appeared.
export const APP_RELEASE_MARKER_KEY = "engenty_app_release";

export interface AppReleaseMarker {
  /** The App the version belongs to. */
  app_id: string;
  /** The preview artifact pinned to that version — what the row renders. */
  artifact_id: string;
  name: string;
  version: number;
}

/** The marker on a message's metadata, when it carries one and it is whole. */
export function readAppReleaseMarker(
  metadata: Record<string, unknown> | null | undefined
): AppReleaseMarker | null {
  const raw = metadata?.[APP_RELEASE_MARKER_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const marker = raw as Partial<AppReleaseMarker>;
  if (
    typeof marker.app_id !== "string" ||
    typeof marker.artifact_id !== "string" ||
    typeof marker.name !== "string" ||
    typeof marker.version !== "number"
  ) {
    return null;
  }
  return {
    app_id: marker.app_id,
    artifact_id: marker.artifact_id,
    name: marker.name,
    version: marker.version,
  };
}
