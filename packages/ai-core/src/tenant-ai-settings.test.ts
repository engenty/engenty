import { describe, expect, it } from "vitest";
import { parseTenantAiSettings } from "./tenant-ai-settings";

describe("parseTenantAiSettings", () => {
  it("keeps gateway model ids and trims whitespace", () => {
    expect(
      parseTenantAiSettings({
        chat_model_id: " openai/gpt-5-mini ",
        classifier_model_id: "openai/gpt-5-nano",
        coordinator_model_id: "anthropic/claude-sonnet-4.5",
      })
    ).toMatchObject({
      chat_model_id: "openai/gpt-5-mini",
      classifier_model_id: "openai/gpt-5-nano",
      coordinator_model_id: "anthropic/claude-sonnet-4.5",
    });
  });

  it("ignores stale bare provider model ids", () => {
    expect(
      parseTenantAiSettings({
        chat_model_id: "gpt-5.3-chat",
        coordinator_model_id: "gpt-5.3-chat",
      })
    ).toMatchObject({
      chat_model_id: null,
      coordinator_model_id: null,
    });
  });
});
