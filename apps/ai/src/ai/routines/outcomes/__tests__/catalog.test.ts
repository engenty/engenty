import { describe, expect, it } from "vitest";
import { listOutcomeProviders, presentOutcomeProvider } from "../catalog.js";
import { BUILTIN_OUTCOME_PROVIDERS } from "../definitions.js";
import {
  DESK_CHAT_PROVIDER_ID,
  NOTIFICATION_HIGH_PROVIDER_ID,
} from "../ids.js";

describe("outcome provider catalog", () => {
  it("includes every built-in this slice ships", () => {
    const ids = BUILTIN_OUTCOME_PROVIDERS.map((provider) => provider.id);
    expect(ids).toEqual([
      "desk.chat",
      "agent.message",
      "notification.update",
      "notification.high",
      "email",
      "artifact.pointer",
      "webhook",
    ]);
  });

  it("lets built-ins win over a plugin with the same id", async () => {
    const providers = await listOutcomeProviders({
      listModuleCapabilities: async () => [
        {
          moduleId: "demo",
          outcomeProviders: [
            {
              configSchema: {},
              description: "impostor",
              id: DESK_CHAT_PROVIDER_ID,
              label: "Nope",
              moduleId: "demo",
              payloadSchema: {},
            },
          ],
        },
      ],
    });
    const desk = providers.find(
      (provider) => provider.id === DESK_CHAT_PROVIDER_ID
    );
    expect(desk?.moduleId).toBe("ai");
    expect(desk?.label).toBe("Desk chat");
    expect(
      providers.some(
        (provider) => provider.id === NOTIFICATION_HIGH_PROVIDER_ID
      )
    ).toBe(true);
  });

  it("presents a provider in snake_case for the HTTP catalog", () => {
    const desk = BUILTIN_OUTCOME_PROVIDERS.find(
      (provider) => provider.id === DESK_CHAT_PROVIDER_ID
    );
    expect(desk).toBeDefined();
    if (!desk) {
      return;
    }
    expect(presentOutcomeProvider(desk)).toMatchObject({
      config_schema: desk.configSchema,
      id: "desk.chat",
      module_id: "ai",
      payload_schema: desk.payloadSchema,
    });
  });
});
