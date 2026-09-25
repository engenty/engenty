import { describe, expect, it } from "vitest";

import { resolveModelWebTools } from "../model-web-tools.js";

// A run gets its model's own search and fetch where the model has them, and
// our fallbacks everywhere else. Ways this can fail: a model is handed a
// provider tool its route rejects (OpenAI's search on the chat-completions
// path, Anthropic's on OpenRouter); a model with built-in search is left on
// the fallback; a gateway model gets a fetch it does not have.

const idsOf = (modelRef: string) => {
  const tools = resolveModelWebTools(modelRef);
  return {
    fetch: (tools.webFetch as { id?: string } | undefined)?.id ?? null,
    search: (tools.webSearch as { id?: string } | undefined)?.id ?? null,
  };
};

describe("resolveModelWebTools", () => {
  it("gives Anthropic models their own search and fetch, directly or via the gateway", () => {
    for (const ref of [
      "anthropic/claude-haiku-4.5",
      "anthropic:claude-haiku-4-5",
    ]) {
      expect(idsOf(ref)).toEqual({
        fetch: "anthropic.web_fetch_20250910",
        search: "anthropic.web_search_20250305",
      });
    }
  });

  it("gives OpenAI models their search only through the gateway", () => {
    expect(idsOf("openai/gpt-5-mini")).toEqual({
      fetch: null,
      search: "openai.web_search",
    });
    expect(idsOf("openai:gpt-5-mini")).toEqual({ fetch: null, search: null });
  });

  it("gives any other gateway model the gateway's search, and no fetch", () => {
    expect(idsOf("deepseek/deepseek-v4.1-flash")).toEqual({
      fetch: null,
      search: "gateway.perplexity_search",
    });
  });

  it("leaves models on other gateways to the fallbacks", () => {
    for (const ref of [
      "openrouter:anthropic/claude-haiku-4.5",
      "mistral:mistral/mistral-large",
      "opper:openai/gpt-5",
    ]) {
      expect(idsOf(ref)).toEqual({ fetch: null, search: null });
    }
  });
});
