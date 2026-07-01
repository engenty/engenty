import { describe, expect, it } from "vitest";
import {
  isKbHubChatRoute,
  isKbScopedReservedArticleId,
  kbHubChatPath,
  kbHubEditPath,
} from "./kb-paths.js";

describe("kb-paths", () => {
  it("detects KB hub chat routes", () => {
    expect(isKbHubChatRoute("/mdl/knowledge-base/engenty/chat")).toBe(true);
    expect(isKbHubChatRoute("/mdl/knowledge-base/engenty/chat/")).toBe(true);
    expect(isKbHubChatRoute("/mdl/knowledge-base/engenty")).toBe(false);
    expect(isKbHubChatRoute("/mdl/engenty-copilot/chat/new")).toBe(false);
  });

  it("builds hub chat paths", () => {
    expect(kbHubChatPath("engenty")).toBe("/mdl/knowledge-base/engenty/chat");
  });

  it("builds hub edit paths", () => {
    expect(kbHubEditPath("default")).toBe("/mdl/knowledge-base/default/edit");
  });

  it("treats reserved article ids", () => {
    expect(isKbScopedReservedArticleId("chat")).toBe(true);
    expect(isKbScopedReservedArticleId("edit")).toBe(true);
    expect(isKbScopedReservedArticleId("c")).toBe(true);
    expect(isKbScopedReservedArticleId("article-uuid")).toBe(false);
  });
});
