import { describe, expect, it } from "vitest";

import { connectionsResumeTarget } from "./connections-approval-subscriber.js";

const DECIDED = {
  approved: true,
  operation_id: "gmail_create_draft",
  request_id: "req-1",
  task_id: "task-7",
};

describe("connectionsResumeTarget", () => {
  it("resumes the approved task-linked operation", () => {
    expect(connectionsResumeTarget(DECIDED, { tenantId: "t-1" })).toEqual({
      operationId: "gmail_create_draft",
      taskId: "task-7",
      tenantId: "t-1",
    });
  });

  it("does nothing on a denial — the task stays blocked on purpose", () => {
    expect(
      connectionsResumeTarget(
        { ...DECIDED, approved: false },
        { tenantId: "t-1" }
      )
    ).toBeNull();
  });

  it("does nothing when the ask was not linked to a task", () => {
    expect(
      connectionsResumeTarget(
        { ...DECIDED, task_id: null },
        { tenantId: "t-1" }
      )
    ).toBeNull();
  });

  it("refuses an event with no tenant — never guesses across tenants", () => {
    expect(connectionsResumeTarget(DECIDED, {})).toBeNull();
  });
});
