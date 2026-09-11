import { describe, expect, it } from "vitest";
import {
  isKbHubChatRoute,
  isKbScopedReservedArticleId,
  kbHubChatPath,
  kbHubEditPath,
} from "./kb-paths.js";

describe("kb-paths", () => {
  it("detects KB hub chat routes", () => {
    expect(isKbHubChatRoute("/mdl/knowledge-base/chat")).toBe(true);
    expect(isKbHubChatRoute("/mdl/knowledge-base/chat/")).toBe(true);
    expect(isKbHubChatRoute("/mdl/knowledge-base")).toBe(false);
    expect(isKbHubChatRoute("/mdl/engenty-copilot/chat/new")).toBe(false);
  });

  it("builds hub chat paths", () => {
    expect(kbHubChatPath()).toBe("/mdl/knowledge-base/chat");
  });

  it("builds hub edit paths", () => {
    expect(kbHubEditPath()).toBe("/mdl/knowledge-base/edit");
  });

  it("treats reserved article ids", () => {
    expect(isKbScopedReservedArticleId("chat")).toBe(true);
    expect(isKbScopedReservedArticleId("edit")).toBe(true);
    expect(isKbScopedReservedArticleId("c")).toBe(true);
    expect(isKbScopedReservedArticleId("article-uuid")).toBe(false);
  });
});
