// The task job is one sequence, defined once (Phase 8 cutover). The Mastra
// workflow that used to hold the same list — and froze it, because an in-flight
// run resumes into the code it was suspended under — is gone.

import { describe, expect, it } from "vitest";
import {
  actingUserIdFromTask,
  toolsSpaceFromResolution,
} from "../../sessions/run-space.js";
import { TASK_JOB_STEP_IDS } from "../task-job-pipeline.js";

describe("task job pipeline", () => {
  it("claims the task first and finalizes it last", () => {
    expect(TASK_JOB_STEP_IDS.at(0)).toBe("checkout");
    expect(TASK_JOB_STEP_IDS.at(-1)).toBe("finalize");
  });

  it("runs the specialist between the brief and the result", () => {
    expect(TASK_JOB_STEP_IDS).toEqual([
      "checkout",
      "build-brief",
      "run-specialist",
      "write-result",
      "finalize",
    ]);
  });
});

describe("task job space resolution", () => {
  const SPACE = "019fe8ec-0000-0000-0000-00000000000a";
  const OWNER = "019fe8ec-0000-0000-0000-0000000000cc";

  it("acts as the task owner when resolving a private Space surface", () => {
    expect(
      actingUserIdFromTask({
        created_by_user_id: "019fe8ec-0000-0000-0000-0000000000bb",
        owner_user_id: OWNER,
      })
    ).toBe(OWNER);
  });

  it("passes unresolved into the delegated run instead of omitting space", () => {
    // Omitting space is tenant-global. A claimed-but-unresolved task Space
    // must refuse module/connector work, not widen.
    expect(
      toolsSpaceFromResolution({
        claimed_space_id: SPACE,
        kind: "unresolved",
        reason: "not_found",
      })
    ).toEqual({
      claimed_space_id: SPACE,
      kind: "unresolved",
      reason: "not_found",
    });
  });

  it("keeps a global task run tenant-wide", () => {
    expect(toolsSpaceFromResolution({ kind: "global" })).toBeNull();
  });
});
