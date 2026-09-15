// The Space home's one round trip (PLAN-space-home.md §4).
//
// The page is the sidebar unfolded, so it does NOT list conversations here —
// the sidebar's own endpoints already do that. This adds the thing the sidebar
// has no answer for: what state each conversation is in right now, and which
// live jobs sit inside it.
//
// Reads only. Every verdict the cards offer goes out through the route that
// already owns it: the room continue, the run resume.
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import { canEnterSpaceDefault } from "../ai/sessions/thread-access.js";
import { scopeAccessToken } from "../ai/sessions/types.js";
import {
  resolveSpaceHomeStates,
  type SpaceHomeAppRelease,
  type SpaceHomeRunInput,
  type SpaceHomeThreadInput,
} from "../ai/spaces/space-home-state.js";
import {
  type AppReleaseMarker,
  readAppReleaseMarker,
} from "../ai/threads/app-release-marker.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AgentRunStore } from "../dal/threads/agent-run-store.js";
import type { ThreadStore } from "../dal/threads/index.js";
import type { ThreadMessageRow, ThreadRow } from "../dal/threads/types.js";
import { THREAD_DM_KEY, THREAD_ROOM_KEY } from "../dal/threads/types.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

const uuidString = z.string().uuid();

/** How far back "fertig" may reach when the client sends no cursor. */
const DEFAULT_SINCE_MS = 24 * 60 * 60 * 1000;
const THREAD_LIMIT = 200;

export type SpaceHomeThreadKind = "desk" | "dm" | "room";

function kindOf(thread: ThreadRow): SpaceHomeThreadKind {
  if (thread.route_context[THREAD_ROOM_KEY] === true) {
    return "room";
  }
  if (thread.route_context[THREAD_DM_KEY] === true) {
    return "dm";
  }
  return "desk";
}

/**
 * The App versions announced in this Space that are STILL waiting.
 *
 * A marker row says a version was proposed; only core knows whether it was
 * activated since. Grouped by App, not by thread, so a Space with one App and
 * twenty conversations asks core once. Any failure yields nothing: a home that
 * omits an approval row is worse than one that shows a stale one, but a home
 * that 500s is worse than both.
 */
async function resolveOpenAppReleases(params: {
  markers: readonly ThreadMessageRow[];
  token: string;
}): Promise<Map<string, SpaceHomeAppRelease[]>> {
  const byThread = new Map<string, SpaceHomeAppRelease[]>();
  const markers = params.markers
    .map((row) => ({ marker: readAppReleaseMarker(row.metadata), row }))
    .filter(
      (entry): entry is { marker: AppReleaseMarker; row: ThreadMessageRow } =>
        entry.marker !== null
    );
  if (markers.length === 0) {
    return byThread;
  }
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!coreBaseUrl) {
    return byThread;
  }
  const client = new EngentyCoreClient({
    accessToken: params.token,
    coreBaseUrl,
  });
  const appIds = [...new Set(markers.map((entry) => entry.marker.app_id))];
  const proposed = new Map<string, Set<number>>();
  await Promise.all(
    appIds.map(async (appId) => {
      try {
        const { versions } = await client.invokeTool<
          { id: string },
          { versions: { status: string; version: number }[] }
        >("app_versions_list", { id: appId });
        proposed.set(
          appId,
          new Set(
            versions
              .filter((version) => version.status === "proposed")
              .map((version) => version.version)
          )
        );
      } catch {
        proposed.set(appId, new Set());
      }
    })
  );
  // Markers arrive newest first; one row per App per thread, so re-proposing
  // the same App does not stack two approvals onto one card.
  const seen = new Set<string>();
  for (const { marker, row } of markers) {
    if (!proposed.get(marker.app_id)?.has(marker.version)) {
      continue;
    }
    const key = `${row.thread_id}:${marker.app_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const list = byThread.get(row.thread_id) ?? [];
    list.push({
      app_id: marker.app_id,
      artifact_id: marker.artifact_id,
      name: marker.name,
      version: marker.version,
    });
    byThread.set(row.thread_id, list);
  }
  return byThread;
}

function toStateInput(
  thread: ThreadRow,
  lastMessage: ThreadMessageRow | undefined,
  appReleases: readonly SpaceHomeAppRelease[]
): SpaceHomeThreadInput {
  return {
    agent_id: thread.agent_id,
    app_releases: appReleases,
    id: thread.id,
    last_message: lastMessage
      ? {
          created_at: lastMessage.created_at,
          metadata: lastMessage.metadata ?? null,
          parts: lastMessage.parts,
          role: lastMessage.role,
        }
      : null,
    metadata: thread.metadata,
    route_context: thread.route_context,
    title: thread.title,
    updated_at: thread.updated_at,
  };
}

export function registerSpaceHomeRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    getRunStore: () => AgentRunStore | null;
    scopeResolver: AiScopeResolver;
    store: ThreadStore;
  }
): void {
  const { store } = opts;

  app.get(`${AI_BASE_PATH}/spaces/:spaceId/home`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const spaceId = c.req.param("spaceId");
    if (!uuidString.safeParse(spaceId).success) {
      return c.json({ error: "agent_threads.invalidBody" }, 400);
    }
    const sinceParam = z
      .string()
      .datetime()
      .optional()
      .safeParse(c.req.query("since") ?? undefined);
    const nowMs = Date.now();
    const sinceMs =
      sinceParam.success && sinceParam.data
        ? Date.parse(sinceParam.data)
        : nowMs - DEFAULT_SINCE_MS;

    try {
      if (!(await canEnterSpaceDefault(scope.scope, spaceId))) {
        return c.json({ error: "agent_threads.forbidden" }, 403);
      }
      const tenantId = scope.scope.tenantId;
      const [mine, rooms, dms, unattended] = await Promise.all([
        // What the viewer takes part in: their desks, and anything else of
        // theirs in this Space.
        store.listThreadsForUser({
          limit: THREAD_LIMIT,
          spaceId,
          tenantId,
          userId: scope.scope.userId,
        }),
        store.listRoomsForSpace({
          limit: THREAD_LIMIT,
          spaceId,
          tenantId,
          viewerUserId: scope.scope.userId,
        }),
        store.listDmsForUser({
          limit: THREAD_LIMIT,
          spaceId,
          tenantId,
          userId: scope.scope.userId,
        }),
        // A routine fired overnight belongs to no user's list, and it is
        // precisely the "läuft"/"fertig" the home exists to show.
        store.listUnattendedThreadsForSpace({
          limit: THREAD_LIMIT,
          spaceId,
          tenantId,
        }),
      ]);

      const byId = new Map<string, ThreadRow>();
      for (const thread of [
        ...mine,
        ...rooms.map((room) => room.thread),
        ...dms,
        ...unattended,
      ]) {
        if (thread.space_id === spaceId && !byId.has(thread.id)) {
          byId.set(thread.id, thread);
        }
      }
      const threads = [...byId.values()];

      const threadIds = threads.map((thread) => thread.id);
      const runStore = opts.getRunStore();
      const [latestMessages, runs, releaseMarkers] = await Promise.all([
        store.listLatestMessagesForThreads({ tenantId, threadIds }),
        runStore
          ? runStore.listRunsForThreads({
              since: new Date(sinceMs).toISOString(),
              tenantId,
              threadIds,
            })
          : [],
        store.listAppReleaseMarkersForThreads({ tenantId, threadIds }),
      ]);
      const token = scopeAccessToken(scope.scope);
      const appReleases = token
        ? await resolveOpenAppReleases({ markers: releaseMarkers, token })
        : new Map<string, SpaceHomeAppRelease[]>();
      const runsByThread = new Map<string, SpaceHomeRunInput[]>();
      for (const run of runs) {
        const list = runsByThread.get(run.thread_id) ?? [];
        list.push(run);
        runsByThread.set(run.thread_id, list);
      }

      const states = resolveSpaceHomeStates({
        nowMs,
        runsByThread,
        sinceMs,
        threads: threads.map((thread) =>
          toStateInput(
            thread,
            latestMessages.get(thread.id),
            appReleases.get(thread.id) ?? []
          )
        ),
      });
      const kinds = new Map(
        threads.map((thread) => [thread.id, kindOf(thread)] as const)
      );

      return c.json({
        // The instant this answer describes: the client sends it back as
        // `since` next time, so "fertig" means "since you last looked".
        cursor: new Date(nowMs).toISOString(),
        threads: states.map((state) => ({
          ...state,
          kind: kinds.get(state.thread_id) ?? "desk",
        })),
      });
    } catch (err) {
      return handleRouteError(
        c,
        "space home failed",
        "agent_threads.listSessionsFailed",
        err
      );
    }
  });
}
