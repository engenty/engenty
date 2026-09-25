import { describe, expect, it } from "vitest";
import {
  compactOutcomeConfig,
  defaultConfigFromSchema,
  defaultOutcomeFormValue,
  outcomeFormToInput,
  outcomeToFormValue,
  validateOutcomeForm,
} from "./routine-outcome-form-value.js";
import type { OutcomeProviderDto, RoutineOutcomeDto } from "./routines-api.js";

const emailProvider: OutcomeProviderDto = {
  config_schema: {
    additionalProperties: false,
    properties: {
      to: { minLength: 3, type: "string" },
    },
    required: ["to"],
    type: "object",
  },
  description: "Send now through Gmail",
  id: "email",
  label: "Email",
  module_id: "ai",
  payload_schema: { type: "object" },
};

const deskProvider: OutcomeProviderDto = {
  config_schema: {
    additionalProperties: false,
    properties: {},
    type: "object",
  },
  description: "Desk chat",
  id: "desk.chat",
  label: "Desk chat",
  module_id: "ai",
  payload_schema: { type: "object" },
};

const row: RoutineOutcomeDto = {
  config: { to: "ops@example.com" },
  created_at: "2026-09-22T00:00:00.000Z",
  enabled: true,
  id: "out-1",
  mode: "agent",
  provider_id: "email",
  routine_id: "routine-1",
  tenant_id: "tenant-1",
  updated_at: "2026-09-22T00:00:00.000Z",
};

describe("outcome form value", () => {
  it("round-trips a stored binding into the wire body", () => {
    expect(outcomeFormToInput(outcomeToFormValue(row))).toEqual({
      config: { to: "ops@example.com" },
      enabled: true,
      mode: "agent",
      provider_id: "email",
    });
  });

  it("drops blank optional config so the server sees an omitted field", () => {
    expect(
      compactOutcomeConfig({ location: "  ", secret: "", url: "https://x" })
    ).toEqual({ url: "https://x" });
  });

  it("seeds schema defaults when picking a provider", () => {
    expect(
      defaultConfigFromSchema({
        properties: { location: { default: "desk", type: "string" } },
        type: "object",
      })
    ).toEqual({ location: "desk" });
  });

  it("refuses a destination with no provider or a missing required field", () => {
    expect(validateOutcomeForm(defaultOutcomeFormValue(), emailProvider)).toBe(
      "providerRequired"
    );
    expect(
      validateOutcomeForm(
        { ...defaultOutcomeFormValue("email"), config: {} },
        emailProvider
      )
    ).toBe("configRequired");
    expect(
      validateOutcomeForm(
        { ...defaultOutcomeFormValue("email"), config: { to: "ab" } },
        emailProvider
      )
    ).toBe("configInvalid");
    expect(
      validateOutcomeForm(
        {
          ...defaultOutcomeFormValue("email"),
          config: { to: "ops@example.com" },
        },
        emailProvider
      )
    ).toBeNull();
    expect(
      validateOutcomeForm(defaultOutcomeFormValue("desk.chat"), deskProvider)
    ).toBeNull();
  });
});
