import { describe, expect, it } from "vitest";
import { makeMockProjectRepo } from "../api/test-helpers.js";
import { buildProjectsBriefingResponse } from "./projects-briefing-service.js";

describe("buildProjectsBriefingResponse", () => {
  it("returns expected top-level shape for personal mode", async () => {
    const repo = makeMockProjectRepo();
    const settings = await repo.getSettings();
    const r = await buildProjectsBriefingResponse(
      repo as never,
      settings,
      "user-1",
      "personal"
    );
    expect(r.mode).toBe("personal");
    expect(r.overdue_days).toBe(7);
    expect(r.summary).toMatchObject({
      blocked_items: expect.any(Number),
      due_this_week: expect.any(Number),
      stale_items: expect.any(Number),
      waiting_items: expect.any(Number),
    });
    expect(Array.isArray(r.focus_items)).toBe(true);
  });
});
