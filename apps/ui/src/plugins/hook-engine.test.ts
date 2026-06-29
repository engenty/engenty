import { describe, expect, it } from "vitest";
import { createHookEngine } from "./hook-engine";

describe("createHookEngine", () => {
  it("runs observers in registration order", async () => {
    const engine = createHookEngine<{
      ping: { value: number };
      values: number[];
    }>();
    const seen: number[] = [];

    engine.on("ping", ({ value }) => {
      seen.push(value + 1);
    });
    engine.on("ping", ({ value }) => {
      seen.push(value + 2);
    });

    await engine.emit("ping", { value: 1 });
    expect(seen).toEqual([2, 3]);
  });

  it("threads returned payloads through as a transformation pipeline", async () => {
    const engine = createHookEngine<{
      ping: { value: number };
      values: number[];
    }>();

    engine.on("values", (payload) => [...payload, 1]);
    engine.on("values", (payload) => payload.map((value) => value * 2));

    await expect(engine.emit("values", [])).resolves.toEqual([2]);
  });

  it("leaves the payload untouched when a handler returns nothing (observe)", async () => {
    const engine = createHookEngine<{ values: number[] }>();

    const seen: number[][] = [];
    engine.on("values", (payload) => {
      seen.push(payload);
      // returns void → observer, payload passes through unchanged
    });
    engine.on("values", (payload) => [...payload, 9]);

    await expect(engine.emit("values", [1])).resolves.toEqual([1, 9]);
    expect(seen).toEqual([[1]]);
  });
});
