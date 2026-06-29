import { describe, expect, it } from "vitest";
import { resolveCopilotChatRoute } from "./resolve-copilot-chat-route.js";

describe("resolveCopilotChatRoute", () => {
  it("parses a thread pathname", () => {
    const id = "83c59288-4187-49d6-ad7f-787caea827d7";
    expect(resolveCopilotChatRoute(`/mdl/engenty-copilot/chat/${id}`)).toEqual({
      isNewThreadRoute: false,
      rawRouteThreadId: id,
      routeThreadId: id,
    });
  });

  it("parses /new", () => {
    expect(resolveCopilotChatRoute("/mdl/engenty-copilot/chat/new")).toEqual({
      isNewThreadRoute: true,
      rawRouteThreadId: "new",
      routeThreadId: null,
    });
  });
});
