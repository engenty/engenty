import { describe, expect, it, vi } from "vitest";
import {
  commercialSettingsAiRegistration,
  commercialSettingsDynamicAiCapability,
} from "./registrar.js";

const noopInvoke = vi.fn(async () => null);

describe("commercialSettingsAiRegistration", () => {
  it("registers the manager Engenty, skills, workflows, and slash commands", () => {
    const registration = commercialSettingsAiRegistration({
      invokeCommercialSettingsOperation: noopInvoke,
    });
    const agent = registration.dynamic?.agent_configs?.find(
      (item) => item.id === "commercial-settings.manager"
    );

    expect(agent).toMatchObject({
      id: "commercial-settings.manager",
      source: "module",
    });
    expect(agent?.skillIds).toEqual([
      "commercial-settings",
      "commercial-charts",
      "commercial-expense-categories",
      "commercial-tax-rates",
      "commercial-disciplines-and-units",
    ]);
    expect(
      (registration.skills ?? []).map((skill) => skill.name).sort()
    ).toEqual([
      "commercial-charts",
      "commercial-disciplines-and-units",
      "commercial-expense-categories",
      "commercial-settings",
      "commercial-tax-rates",
    ]);
    expect(registration.workflows?.map((item) => item.id).sort()).toEqual([
      "commercial-settings.review",
      "commercial-settings.seed-region",
    ]);
    expect(
      registration.chat_commands?.map((item) => item.command).sort()
    ).toEqual(["review-commercial", "seed-chart"]);
  });

  it("tells the charts skill never to use class 4 for Austrian expenses", () => {
    const registration = commercialSettingsAiRegistration({
      invokeCommercialSettingsOperation: noopInvoke,
    });
    expect(registration.dynamic?.skills?.["commercial-charts"]).toMatch(
      /never 4400/i
    );
    expect(registration.dynamic?.skills?.["commercial-settings"]).toMatch(
      /tenant-shared/
    );
  });
});

describe("commercialSettingsDynamicAiCapability", () => {
  it("exposes named tools for settings and region packs", async () => {
    const invoke = vi.fn(async (name: string) => {
      expect(name).toBe("commercial_settings_get");
      return { currency: "EUR", default_locale: "de-AT" };
    });
    const capability = commercialSettingsDynamicAiCapability({
      invokeCommercialSettingsOperation: invoke,
    });

    expect(capability.moduleId).toBe("commercial-settings");
    expect(capability.tools).toHaveProperty("loadCommercialSettings");
    expect(capability.tools).toHaveProperty("setCommercialDefaults");
    expect(capability.tools).toHaveProperty("setCommercialCollection");
    expect(capability.tools).toHaveProperty("listRegionPacks");
    expect(capability.tools).toHaveProperty("loadRegionPack");
    expect(capability.tools).toHaveProperty("lookupChartAccount");
    expect(capability.tools).toHaveProperty("mergeExpenseCategoriesFromRegion");
    expect(capability.tools).toHaveProperty("mergeTaxRatesFromRegion");

    await expect(
      (
        capability.tools?.loadCommercialSettings as {
          execute: (input: Record<string, never>) => Promise<unknown>;
        }
      ).execute({})
    ).resolves.toEqual({ currency: "EUR", default_locale: "de-AT" });
  });
});
