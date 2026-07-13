import { describe, expect, it } from "vitest";
import { classifyHttpOperation, classifyMcpTool } from "./classify.js";

describe("classifyHttpOperation", () => {
  it("maps safe methods to read", () => {
    expect(classifyHttpOperation("get", "/pets")).toBe("read");
    expect(classifyHttpOperation("HEAD", "/pets")).toBe("read");
    expect(classifyHttpOperation("options", "/pets")).toBe("read");
  });

  it("maps DELETE to destructive", () => {
    expect(classifyHttpOperation("delete", "/pets/{id}")).toBe("destructive");
  });

  it("maps mutating methods to write", () => {
    expect(classifyHttpOperation("post", "/pets")).toBe("write");
    expect(classifyHttpOperation("put", "/pets/{id}")).toBe("write");
    expect(classifyHttpOperation("patch", "/pets/{id}")).toBe("write");
  });

  it("upgrades destructive-verb paths to destructive", () => {
    expect(classifyHttpOperation("post", "/tokens/{id}/revoke")).toBe(
      "destructive"
    );
    expect(classifyHttpOperation("post", "/jobs/{id}/cancel")).toBe(
      "destructive"
    );
  });
});

describe("classifyMcpTool", () => {
  it("trusts readOnlyHint", () => {
    expect(classifyMcpTool({ readOnlyHint: true })).toBe("read");
  });

  it("trusts destructiveHint", () => {
    expect(classifyMcpTool({ destructiveHint: true })).toBe("destructive");
  });

  it("defaults to write without hints", () => {
    expect(classifyMcpTool({})).toBe("write");
  });
});
