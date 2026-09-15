import { describe, expect, it, vi } from "vitest";
import {
  getRegionPack,
  listRegionPackSummaries,
  lookupChartAccounts,
  normalizeRegion,
} from "../src/region-packs.js";
import {
  buildLookupChartAccountTool,
  buildMergeExpenseCategoriesFromRegionTool,
} from "./tools/region-pack-tools.js";
import { buildSetCommercialCollectionTool } from "./tools/set-commercial-collection.js";

describe("region pack helpers", () => {
  it("normalizes locales to ISO region", () => {
    expect(normalizeRegion("de-AT")).toBe("AT");
    expect(normalizeRegion("at")).toBe("AT");
  });

  it("lists AT EKR among shipped packs", () => {
    const at = listRegionPackSummaries().find((pack) => pack.region === "AT");
    expect(at?.short_name).toBe("EKR");
    expect(at?.expense_class).toBe("7");
    expect(at?.category_count).toBeGreaterThanOrEqual(15);
  });

  it("looks up Austrian travel on class 7", () => {
    const { matches } = lookupChartAccounts({
      code: "reise",
      region: "de-AT",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      account_class: "7",
      account_number: "7340",
      code: "reise",
      region: "AT",
    });
  });

  it("returns chart metadata for AT", () => {
    expect(getRegionPack("AT").chart?.id).toBe("at-ekr");
  });
});

describe("region pack tools", () => {
  it("looks up a category without hitting the gateway", async () => {
    const tool = buildLookupChartAccountTool();
    const result = (await tool.execute!(
      {
        code: "bewirtung",
        region: "AT",
      },
      {} as never
    )) as { matches: Array<{ account_number: string }> };
    expect(result.matches[0]?.account_number).toBe("7650");
  });

  it("dry-runs an expense merge against current settings", async () => {
    const invoke = vi.fn(async (name: string) => {
      expect(name).toBe("commercial_settings_get");
      return {
        default_locale: "de-AT",
        expense_categories: [
          {
            code: "reise",
            default_deduction_rate: 1,
            is_tax_deductible: true,
            name: "Travel",
          },
        ],
      };
    });
    const tool = buildMergeExpenseCategoriesFromRegionTool(invoke);
    const result = (await tool.execute!({ dry_run: true }, {} as never)) as {
      added: number;
      dry_run: boolean;
      expense_categories: Array<{
        account_number?: string | null;
        code: string;
      }>;
      region: string;
    };
    expect(result.dry_run).toBe(true);
    expect(result.region).toBe("AT");
    expect(result.added).toBeGreaterThan(0);
    expect(
      result.expense_categories.find((row) => row.code === "reise")
        ?.account_number
    ).toBe("7340");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe("setCommercialCollection", () => {
  it("routes disciplines to the collection-scoped operation", async () => {
    const invoke = vi.fn(async (name: string, input: unknown) => {
      expect(name).toBe("commercial_settings_disciplines_set");
      return input;
    });
    const tool = buildSetCommercialCollectionTool(invoke);
    await tool.execute!(
      {
        collection: "disciplines",
        disciplines: [{ name: "Design", rate: 120, short: "UX" }],
      },
      {} as never
    );
    expect(invoke).toHaveBeenCalledWith("commercial_settings_disciplines_set", {
      disciplines: [{ name: "Design", rate: 120, short: "UX" }],
    });
  });
});
