import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  awaitHumanAnswer,
  getHumanInTheLoopRender,
  registerHumanInTheLoopRender,
  resolveHumanAnswer,
} from "./human-in-the-loop-registry.js";

describe("human-in-the-loop render registry", () => {
  it("registers, looks up, and unregisters by tool name", () => {
    const entry = {
      render: () => null,
      schema: z.object({ ok: z.boolean() }),
    };
    const cleanup = registerHumanInTheLoopRender("confirm_x", entry);
    expect(getHumanInTheLoopRender("confirm_x")).toBe(entry);
    cleanup();
    expect(getHumanInTheLoopRender("confirm_x")).toBeUndefined();
  });

  it("cleanup only removes its own registration", () => {
    const first = { render: () => null, schema: z.object({}) };
    const second = { render: () => null, schema: z.object({}) };
    const cleanupFirst = registerHumanInTheLoopRender("dup", first);
    registerHumanInTheLoopRender("dup", second); // supersedes
    cleanupFirst(); // stale cleanup must not remove `second`
    expect(getHumanInTheLoopRender("dup")).toBe(second);
  });
});

describe("human-in-the-loop answer store", () => {
  it("resolves the handler's await when respond comes first", async () => {
    resolveHumanAnswer("call-a", { approved: true });
    await expect(awaitHumanAnswer("call-a")).resolves.toEqual({
      approved: true,
    });
  });

  it("resolves the handler's await when await comes first", async () => {
    const promise = awaitHumanAnswer("call-b");
    resolveHumanAnswer("call-b", { value: 42 });
    await expect(promise).resolves.toEqual({ value: 42 });
  });

  it("isolates answers per call id", async () => {
    resolveHumanAnswer("call-c", "c");
    resolveHumanAnswer("call-d", "d");
    await expect(awaitHumanAnswer("call-d")).resolves.toBe("d");
    await expect(awaitHumanAnswer("call-c")).resolves.toBe("c");
  });
});
