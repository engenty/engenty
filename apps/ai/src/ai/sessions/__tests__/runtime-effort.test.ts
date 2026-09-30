import { describe, expect, it, vi } from "vitest";
import { resolveAgentModelId } from "../../registry/assemble-dynamic-agent.js";
import { resolveRuntimeModelConfig } from "../runtime-model-config.js";
import type { AiSessionScope, ThreadServiceOptions } from "../types.js";

const scope: AiSessionScope = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
};

/**
 * Opaque binding fixtures — distinct ids per graded role so assertions prove
 * effort→role→binding resolution. These are NOT package seed defaults; using
 * DEFAULT_AI_* here would couple the test to product defaults and hide bugs
 * when seeds change but binding lookup is wrong.
 */
const NORMAL = "vendor/fixture-normal";
const HIGH = "vendor/fixture-high";

const BINDINGS = [
  {
    gateway: "vercel",
    model_id: NORMAL,
    role: "model.normal",
    scope: "platform",
    updated_at: "",
  },
  {
    gateway: "vercel",
    model_id: HIGH,
    role: "model.high",
    scope: "platform",
    updated_at: "",
  },
  // Every run also resolves these two; a binding table without them is broken.
  {
    gateway: "vercel",
    model_id: "vendor/fixture-classifier",
    role: "classifier",
    scope: "platform",
    updated_at: "",
  },
  {
    gateway: "vercel",
    model_id: "vendor/fixture-fast-text",
    role: "fast_text",
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
    expect(config.chatModelId).toBe(HIGH);
  });

  it("degrades to the plan ceiling instead of refusing", async () => {
    // A Normal-only plan asked for high: the tenant gets an answer, not a 429.
    const config = await resolveRuntimeModelConfig(
      makeOpts({ ...unrestricted, allowed_efforts: ["normal"] }),
      scope,
      null,
      "high"
    );
    expect(config.chatModelId).toBe(NORMAL);
  });

  it("keeps a Custom pick on the picked model, even for an agent with its own tier", async () => {
    // Custom sends a pin and no tier. The agent's default tier must not
    // replace the model the person picked.
    const config = await resolveRuntimeModelConfig(
      makeOpts(unrestricted),
      scope,
      "mistral/mistral-large",
      null
    );
    expect(
      resolveAgentModelId(
        {
          effort: "normal",
          id: "a",
          instructions: "x",
          name: "A",
          skillIds: [],
          toolIds: [],
        },
        config
      )
    ).toBe("mistral/mistral-large");
  });

  it("falls through to the tenant default when no effort is picked", async () => {
    const config = await resolveRuntimeModelConfig(
      makeOpts(unrestricted),
      scope,
      null,
      null
    );
    expect(config.chatModelId).toBe(NORMAL);
  });
});
