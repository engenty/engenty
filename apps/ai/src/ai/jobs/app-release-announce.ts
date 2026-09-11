// Telling a person that an App version is waiting for them.
//
// `app_release_propose` leaves the version built but inert — activating it is
// `apps.approve`, a human act. Until this ran, nothing said so: the preview
// artifact appeared in a pane with an Approve button and no row anywhere led
// to it, so a build by a delegated colleague came to rest with the person
// unaware they were the blocker.
//
// Two surfaces, one call: a marker row in the conversation the build was
// asked for (rendered as the App with its review banner) and a decision
// notification for the bell. Neither failure ever fails the build.
import { createLogger } from "@engenty/telemetry";
import { createThreadStore } from "../../dal/threads/index.js";
import { createDbSourceFromEnv } from "../../infra/tenant-db.js";
import { emitInboxNotification } from "../../notifications/inbox.js";
import {
  APP_RELEASE_MARKER_KEY,
  type AppReleaseMarker,
} from "../threads/app-release-marker.js";

const logger = createLogger({ name: "app-release-announce" });

export const APP_RELEASE_SUBJECT = "app_release";

/** The row a re-propose of the same version merges into. */
export function appReleaseDedupeKey(input: {
  appId: string;
  tenantId: string;
  version: number;
}): string {
  return `${APP_RELEASE_SUBJECT}:${input.tenantId}:${input.appId}:${input.version}`;
}

export interface AnnounceAppReleaseInput {
  appId: string;
  artifactId: string;
  /** The agent that built it, when a run has one — the actor on the row. */
  builtByAgentId?: string | null;
  name: string;
  tenantId: string;
  /** The conversation the person is watching, where the marker lands. */
  threadId: string;
  userId?: string | null;
  version: number;
}

export async function announceAppRelease(
  input: AnnounceAppReleaseInput
): Promise<void> {
  const source = createDbSourceFromEnv();
  if (!source) {
    return;
  }
  const store = createThreadStore(source);
  const thread = await store
    .getThread({ tenantId: input.tenantId, threadId: input.threadId })
    .catch(() => null);
  if (!thread) {
    return;
  }
  const marker: AppReleaseMarker = {
    app_id: input.appId,
    artifact_id: input.artifactId,
    name: input.name,
    version: input.version,
  };
  const summary = `"${input.name}" version ${input.version} is built and waiting for your approval.`;
  try {
    await store.appendMessage({
      authorUserId: null,
      metadata: { [APP_RELEASE_MARKER_KEY]: marker },
      // The text is what the MODEL reads on the next turn — the card is what
      // the person reads. Both must say the same thing, or the agent reports
      // an app as live that nobody activated.
      parts: [{ text: summary, type: "text" }],
      role: "assistant",
      tenantId: input.tenantId,
      threadId: input.threadId,
    });
  } catch (error) {
    logger.warn("app release marker failed", {
      appId: input.appId,
      message: error instanceof Error ? error.message : String(error),
      threadId: input.threadId,
    });
  }
  // Whoever owns the conversation is who the decision is owed to; a service
  // run with neither has nobody to tell.
  const participantUserIds = [
    ...new Set(
      [thread.created_by_user_id, input.userId ?? null].filter(
        (id): id is string => Boolean(id)
      )
    ),
  ];
  if (participantUserIds.length === 0) {
    return;
  }
  await emitInboxNotification({
    ...(input.builtByAgentId
      ? { actor: { id: input.builtByAgentId, kind: "agent" as const } }
      : {}),
    dedupeKey: appReleaseDedupeKey({
      appId: input.appId,
      tenantId: input.tenantId,
      version: input.version,
    }),
    kind: "app_release_proposed",
    metadata: {
      app_id: input.appId,
      artifact_id: input.artifactId,
      thread_agent_id: thread.agent_id,
      thread_id: input.threadId,
      version: input.version,
    },
    participantUserIds,
    priority: "medium",
    source: "apps",
    spaceId: thread.space_id ?? null,
    subject: {
      id: `${input.appId}:${input.version}`,
      type: APP_RELEASE_SUBJECT,
    },
    summary,
    tenantId: input.tenantId,
  });
}
