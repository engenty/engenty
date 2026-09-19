import { beforeEach, describe, expect, it, vi } from "vitest";

const emitInboxNotification = vi.fn(async (_input: unknown) => null);
const getThread = vi.fn();
const appendMessage = vi.fn(async () => undefined);

vi.mock("../../../notifications/inbox.js", () => ({
  emitInboxNotification: (input: unknown) => emitInboxNotification(input),
}));
vi.mock("../../../infra/tenant-db.js", () => ({
  createDbSourceFromEnv: () => ({}),
}));
vi.mock("../../../dal/threads/index.js", () => ({
  createThreadStore: () => ({ appendMessage, getThread }),
}));

const { announceAppRelease, appReleaseDedupeKey } = await import(
  "../app-release-announce.js"
);

const TENANT = "22222222-2222-4222-8222-222222222222";
const APP_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "57912651-aa5f-4908-af93-c586e67086a1";
const SPACE_ID = "01a0aa05-e37c-736a-af16-ea36e3c133ff";

function lastEmit() {
  return emitInboxNotification.mock.calls.at(-1)?.[0] as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  emitInboxNotification.mockClear();
  getThread.mockReset();
  appendMessage.mockClear();
});

describe("announceAppRelease", () => {
  it("addresses a space conversation to the space, not the thread owner", async () => {
    getThread.mockResolvedValue({
      agent_id: "apps.builder",
      created_by_user_id: "alice",
      space_id: SPACE_ID,
    });

    await announceAppRelease({
      appId: APP_ID,
      artifactId: "art-1",
      builtByAgentId: "apps.builder",
      name: "Arbeitsmarkt-Briefings",
      tenantId: TENANT,
      threadId: THREAD_ID,
      userId: "alice",
      version: 1,
    });

    expect(appendMessage).toHaveBeenCalledOnce();
    expect(lastEmit()).toMatchObject({
      actor: { id: "apps.builder", kind: "agent" },
      dedupeKey: appReleaseDedupeKey({
        appId: APP_ID,
        tenantId: TENANT,
        version: 1,
      }),
      kind: "app_release_proposed",
      spaceId: SPACE_ID,
      subscribers: ["alice"],
      summary:
        '"Arbeitsmarkt-Briefings" version 1 is built and waiting for your approval.',
    });
    expect(lastEmit().participantUserIds).toBeUndefined();
    expect(lastEmit().preSeenUserIds).toBeUndefined();
  });

  it("fans a conversation outside any space out to its people", async () => {
    getThread.mockResolvedValue({
      agent_id: "apps.builder",
      created_by_user_id: "alice",
      space_id: null,
    });

    await announceAppRelease({
      appId: APP_ID,
      artifactId: "art-1",
      name: "Todo",
      tenantId: TENANT,
      threadId: THREAD_ID,
      userId: "bob",
      version: 2,
    });

    expect(lastEmit()).toMatchObject({
      participantUserIds: ["alice", "bob"],
      spaceId: null,
    });
    expect(lastEmit().subscribers).toBeUndefined();
  });
});
