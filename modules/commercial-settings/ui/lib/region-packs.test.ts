import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  accountClassFromNumber,
  STANDARD_TAX_PRESETS,
} from "./region-packs.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../data");

function loadPack(region: string) {
  return JSON.parse(
    readFileSync(join(dataDir, region, "expense-categories.json"), "utf8")
  ) as {
    categories: Array<{
      account_class: string;
      account_number: string;
      code: string;
    }>;
  };
}

describe("region packs", () => {
  it("derives Kontoklasse from the leading account digit", () => {
    expect(accountClassFromNumber("7340")).toBe("7");
    expect(accountClassFromNumber("4660")).toBe("4");
    expect(accountClassFromNumber("")).toBeNull();
  });

  it("keeps GB VAT in the tax pack", () => {
    expect(STANDARD_TAX_PRESETS.GB.map((r) => r.value)).toEqual([20, 5]);
  });

  it.each([
    "AT",
    "DE",
    "CH",
  ])("%s JSON and CSV category codes stay in sync", (region) => {
    const pack = loadPack(region);
    const csv = readFileSync(
      join(dataDir, region, "expense-categories.csv"),
      "utf8"
    );
    const csvCodes = csv
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.split(",")[0]);
    expect(csvCodes).toEqual(pack.categories.map((c) => c.code));
    for (const row of pack.categories) {
      expect(row.account_class).toBe(row.account_number[0]);
    }
  });
});
