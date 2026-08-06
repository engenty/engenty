import { describe, expect, it } from "vitest";
import { appsAiThreadQueryRoot } from "../ag-ui/apps-ai/apps-ai-thread-api.js";
import { ENGENTY_COPILOT_HOST_KEY } from "../agent-provider/host-keys.js";
import { engentyThreadsListQueryKey } from "./engenty-threads-query-keys.js";

const serviceBaseUrl = "https://svc.example";

// The thread-list realtime handler cannot know which host/agent a changed row
// belongs to, so it prefix-invalidates [...root, "list", serviceBaseUrl].
// TanStack matches prefixes positionally: if the real list key ever stops
// starting with exactly that, the invalidation silently matches NOTHING and
// other windows stop refetching — which is precisely how the thread/session
// rename broke new chats appearing in a second window (the handler still said
// "sessions" after the lists moved to "threads"). Pin the relationship.
describe("thread list query keys", () => {
  const invalidationPrefix = [...appsAiThreadQueryRoot, "list", serviceBaseUrl];

  it.each([
    { agentId: null, hostKey: ENGENTY_COPILOT_HOST_KEY },
    { agentId: "contacts.manager", hostKey: ENGENTY_COPILOT_HOST_KEY },
    { agentId: null, hostKey: "some-other-host" },
  ])("the realtime invalidation prefix matches the list key for %o", ({
    agentId,
    hostKey,
  }) => {
    const listKey = engentyThreadsListQueryKey({
      agentId,
      hostKey,
      serviceBaseUrl,
    });

    expect(listKey.slice(0, invalidationPrefix.length)).toEqual(
      invalidationPrefix
    );
  });

  it("the archived variant is covered by the same prefix", () => {
    const listKey = engentyThreadsListQueryKey({
      hostKey: ENGENTY_COPILOT_HOST_KEY,
      includeArchived: true,
      serviceBaseUrl,
    });

    expect(listKey.slice(0, invalidationPrefix.length)).toEqual(
      invalidationPrefix
    );
  });

  it("a different service base url is NOT covered", () => {
    const listKey = engentyThreadsListQueryKey({
      hostKey: ENGENTY_COPILOT_HOST_KEY,
      serviceBaseUrl: "https://other.example",
    });

    expect(listKey.slice(0, invalidationPrefix.length)).not.toEqual(
      invalidationPrefix
    );
  });
});
