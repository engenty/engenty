import { describe, expect, it } from "vitest";
import { runParallelTasks } from "../parallel-tasks.js";

describe("runParallelTasks", () => {
  it("preserves task order across fulfilled and rejected results", async () => {
    const results = await runParallelTasks([
      {
        id: "first",
        run: async () => "alpha",
      },
      {
        id: "second",
        run: async () => {
          throw new Error("boom");
        },
      },
      {
        id: "third",
        run: async () => "omega",
      },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      id: "first",
      status: "fulfilled",
      value: "alpha",
    });
    expect(results[1]?.id).toBe("second");
    expect(results[1]?.status).toBe("rejected");
    expect(results[2]).toEqual({
      id: "third",
      status: "fulfilled",
      value: "omega",
    });
  });

  it("respects the requested concurrency ceiling", async () => {
    let running = 0;
    let peak = 0;

    await runParallelTasks(
      Array.from({ length: 5 }, (_, index) => ({
        id: `task-${index}`,
        run: async () => {
          running += 1;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          running -= 1;
          return index;
        },
      })),
      { concurrency: 2 }
    );

    expect(peak).toBe(2);
  });
});
