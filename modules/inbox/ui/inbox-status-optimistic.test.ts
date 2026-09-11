import { describe, expect, it } from "vitest";
import type {
  InboxThreadDetail,
  InboxThreadsListResult,
} from "../src/schema/types.js";
import {
  patchThreadDetailStatus,
  patchThreadListStatus,
} from "./inbox-status-optimistic.js";

describe("inbox status optimistic reducers", () => {
  it("updates matching messages in thread detail immediately", () => {
    const detail = {
      messages: [
        { id: "message-1", status: "new" },
        { id: "message-2", status: "new" },
      ],
      thread: { id: "thread-1" },
    } as InboxThreadDetail;
    const patched = patchThreadDetailStatus(
      detail,
      new Set(["message-1"]),
      "archived"
    );
    expect(patched?.messages.map(({ status }) => status)).toEqual([
      "archived",
      "new",
    ]);
    expect(detail.messages[0].status).toBe("new");
  });

  it("removes a thread from a now-mismatched filtered lane", () => {
    const list = {
      threads: [{ id: "thread-1", latest_status: "new" }],
      total: 1,
    } as InboxThreadsListResult;
    const patched = patchThreadListStatus(
      list,
      new Set(["thread-1"]),
      "archived",
      { status: "new" }
    );
    expect(patched).toEqual({ threads: [], total: 0 });
  });
});
