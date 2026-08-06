import { describe, expect, it, vi } from "vitest";
import { resolveRuntimeModelConfig } from "../runtime-model-config.js";
import type { AiSessionScope, ThreadServiceOptions } from "../types.js";

const scope: AiSessionScope = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
};

const BINDINGS = [
  {
    gateway: "vercel",
    model_id: "openai/gpt-5-nano",
    role: "model.low",
    scope: "platform",
    updated_at: "",
  },
  {
    gateway: "vercel",
    model_id: "openai/gpt-5-mini",
    role: "model.medium",
    scope: "platform",
    updated_at: "",
  },
  {
    gateway: "vercel",
    model_id: "anthropic/claude-opus-5",
    role: "model.high",
    scope: "platform",
    updated_at: "",
  },
];

function makeOpts(
  policy: Record<string, unknown> | null
): ThreadServiceOptions {
  return {
    getUsageStore: () => ({
      getTenantPolicy: vi.fn(async () => policy),
      listModelBindings: vi.fn(async () => BINDINGS),
    }),
  } as unknown as ThreadServiceOptions;
}

const unrestricted = {
  enforcement_mode: "observe",
  allowed_efforts: null,
  allowed_models: null,
  allowed_providers: null,
};

describe("effort resolution", () => {
  it("turns an effort pick into the model bound to that tier", async () => {
    const config = await resolveRuntimeModelConfig(
      makeOpts(unrestricted),
      scope,
      null,
      "high"
    );
    expect(config.chatModelId).toBe("anthropic/claude-opus-5");
  });

  it("degrades to the plan ceiling instead of refusing", async () => {
    // A low-only plan asked for high: the tenant gets an answer, not a 429.
    const config = await resolveRuntimeModelConfig(
      makeOpts({ ...unrestricted, allowed_efforts: ["low"] }),
      scope,
      null,
      "high"
    );
    expect(config.chatModelId).toBe("openai/gpt-5-nano");
  });

  it("lets an explicit model pin beat the effort pick", async () => {
    // Expert / self-hosted installs pin deliberately; effort must not override.
    const config = await resolveRuntimeModelConfig(
      makeOpts(unrestricted),
      scope,
      "mistral/mistral-large",
      "low"
    );
    expect(config.chatModelId).toBe("mistral/mistral-large");
  });

  it("falls through to the tenant default when no effort is picked", async () => {
    const config = await resolveRuntimeModelConfig(
      makeOpts(unrestricted),
      scope,
      null,
      null
    );
    expect(config.chatModelId).toBe("openai/gpt-5-mini");
  });
});
