import { describe, expect, it } from "vitest";
import {
  getProjectTaskProgressTone,
  summarizeProjectTaskCounts,
} from "./project-task-progress.js";

describe("project task progress", () => {
  it("summarizes done and total counts", () => {
    expect(
      summarizeProjectTaskCounts({
        todo: 1,
        in_progress: 0,
        done: 5,
        cancelled: 1,
      })
    ).toEqual({
      done: 5,
      open: 1,
      total: 7,
      ratio: 5 / 7,
    });
  });

  it("classifies progress tone", () => {
    expect(
      getProjectTaskProgressTone({ done: 6, open: 0, total: 6, ratio: 1 })
    ).toBe("complete");
    expect(
      getProjectTaskProgressTone({ done: 0, open: 6, total: 6, ratio: 0 })
    ).toBe("open");
    expect(
      getProjectTaskProgressTone({ done: 3, open: 3, total: 6, ratio: 0.5 })
    ).toBe("inProgress");
    expect(getProjectTaskProgressTone(undefined)).toBe("none");
  });
});
