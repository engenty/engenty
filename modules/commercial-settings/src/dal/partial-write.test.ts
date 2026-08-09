// A write must touch only the columns it was given.
//
// `set()` used to build every column on every call, so a caller sending only
// `disciplines` also wrote `tax_rates_json: null` — erasing the tax rates, units,
// expense categories and deduction rules. The UI never hit it (it GETs the whole
// object and PATCHes it back whole); the collection-scoped operations are partial
// by design, so this is the invariant they rest on.
import { describe, expect, it } from "vitest";
import { createCommercialSettingsRepoSupabase } from "./index.js";

function fakeAdapter() {
  const upserts: Record<string, unknown>[] = [];
  const builder: Record<string, unknown> = {
    eq: () => builder,
    select: () => builder,
    single: async () => ({ data: null, error: null }),
    upsert: (row: Record<string, unknown>) => {
      upserts.push(row);
      return builder;
    },
  };
  return {
    adapter: { schema: () => ({ from: () => builder }) },
    upserts,
  };
}

function repoFor(adapter: unknown) {
  return createCommercialSettingsRepoSupabase(adapter, "tenant-1", "default");
}

describe("commercial settings partial writes", () => {
  it("writes only the collection it was given", async () => {
    const { adapter, upserts } = fakeAdapter();

    await repoFor(adapter).set({
      disciplines: [{ name: "UX Design", rate: 140, short: "UX" }],
    });

    expect(Object.keys(upserts[0]).sort()).toEqual([
      "disciplines_json",
      "scope_id",
      "tenant_id",
      "updated_at",
    ]);
    expect(upserts[0].disciplines_json).toBe(
      JSON.stringify([{ name: "UX Design", rate: 140, short: "UX" }])
    );
  });

  it("clears a field only when it is explicitly null", async () => {
    // Absent and null have to stay distinguishable, or "leave it alone" and
    // "empty it" collapse into the same call.
    const { adapter, upserts } = fakeAdapter();

    await repoFor(adapter).set({ units: null });

    expect(upserts[0].units_json).toBeNull();
    expect("tax_rates_json" in upserts[0]).toBe(false);
  });

  it("still writes every supplied field on a whole-object save", async () => {
    // The UI path: load, edit, PATCH the lot.
    const { adapter, upserts } = fakeAdapter();

    await repoFor(adapter).set({
      currency: "EUR",
      disciplines: [],
      expense_categories: [],
      tax_deduction_rules: [],
      tax_rates: [],
      units: [],
    });

    expect(Object.keys(upserts[0]).sort()).toEqual([
      "currency",
      "disciplines_json",
      "expense_categories_json",
      "scope_id",
      "tax_deduction_rules_json",
      "tax_rates_json",
      "tenant_id",
      "units_json",
      "updated_at",
    ]);
  });
});
