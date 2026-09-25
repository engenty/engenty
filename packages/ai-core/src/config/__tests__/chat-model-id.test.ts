import { afterEach, describe, expect, it } from "vitest";
import { resolveChatModelId } from "../chat-model-id.js";
import { bindingsFromList } from "../model-roles.js";
import {
  ModelRoleNotBoundError,
  setPlatformBindings,
} from "../platform-bindings-snapshot.js";

const bindings = bindingsFromList([
  { gateway: "vercel", modelId: "bound/medium", role: "model.medium" },
  { gateway: "openrouter", modelId: "bound/fast", role: "fast_text" },
]);

describe("resolveChatModelId", () => {
  afterEach(() => setPlatformBindings(undefined));

  it("uses override, then tenantDefault, then the binding", () => {
    expect(
      resolveChatModelId({
        bindings,
        override: "  custom/model  ",
        purpose: "chat",
        tenantDefault: "tenant/x",
      })
    ).toBe("custom/model");
    expect(
      resolveChatModelId({
        bindings,
        purpose: "chat",
        tenantDefault: "tenant/chat",
      })
    ).toBe("tenant/chat");
    expect(resolveChatModelId({ bindings, purpose: "chat" })).toBe(
      "bound/medium"
    );
  });

  it("maps fast_text to its own role and keeps the gateway", () => {
    expect(resolveChatModelId({ bindings, purpose: "fast_text" })).toBe(
      "openrouter:bound/fast"
    );
  });

  it("reads the process snapshot when no bindings are passed", () => {
    setPlatformBindings(bindings);
    expect(resolveChatModelId({ purpose: "chat" })).toBe("bound/medium");
  });

  it("throws when the role is not bound — there is no default model", () => {
    expect(() => resolveChatModelId({ purpose: "chat" })).toThrow(
      ModelRoleNotBoundError
    );
    setPlatformBindings(
      bindingsFromList([
        { gateway: "vercel", modelId: "x", role: "model.medium" },
      ])
    );
    expect(() => resolveChatModelId({ purpose: "fast_text" })).toThrow(
      'Model role "fast_text" is not bound'
    );
  });
});
