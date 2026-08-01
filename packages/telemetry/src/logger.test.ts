import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("evlog", () => ({ log }));
vi.mock("./evlog-init.js", () => ({ initEvlog: () => {} }));

import { createLogger } from "./logger.js";

describe("createLogger", () => {
  beforeEach(() => {
    log.error.mockReset();
    log.info.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("logs tag + message positionally when there is no meta", () => {
    createLogger({ name: "scheduler" }).info("reconciled");
    expect(log.info).toHaveBeenCalledWith("scheduler", "reconciled");
  });

  it("keeps its own message when meta carries one, preserving it as detail", () => {
    // `{ message: err.message }` is the convention across the tree; spreading
    // it last used to replace the log's message, so a failing reconcile printed
    // as a bare error string with no hint of what had failed.
    createLogger({ name: "scheduler" }).error("scheduler reconcile failed", {
      message: "no bearer token",
    });
    expect(log.error).toHaveBeenCalledWith({
      detail: "no bearer token",
      message: "scheduler reconcile failed",
      tag: "scheduler",
    });
  });

  it("keeps its own tag when meta carries one, preserving it as scope", () => {
    createLogger({ name: "scheduler" }).error("boom", { tag: "triggers" });
    expect(log.error).toHaveBeenCalledWith({
      message: "boom",
      scope: "triggers",
      tag: "scheduler",
    });
  });

  it("passes other meta keys through untouched", () => {
    createLogger({ name: "scheduler" }).info("trigger fired", {
      attempt: 2,
      triggerId: "t-1",
    });
    expect(log.info).toHaveBeenCalledWith({
      attempt: 2,
      message: "trigger fired",
      tag: "scheduler",
      triggerId: "t-1",
    });
  });
});
