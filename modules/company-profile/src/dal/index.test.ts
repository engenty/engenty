import { describe, expect, it, vi } from "vitest";
import { createCompanyProfileRepoSupabase } from "./index.js";

function makeSupabaseWithFromSequence(builders: unknown[]) {
  const from = vi.fn();
  for (const builder of builders) {
    from.mockImplementationOnce(() => builder);
  }
  if (builders.length > 0) {
    from.mockImplementation(() => builders.at(-1));
  }
  const schema = vi.fn(() => ({ from }));
  return {
    supabase: { schema } as never,
    schema,
    from,
  };
}

describe("createCompanyProfileRepoSupabase", () => {
  it("uses schema module_company_profile and table settings", async () => {
    const selectBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
    };

    const { supabase, schema, from } = makeSupabaseWithFromSequence([
      selectBuilder,
    ]);
    const repo = createCompanyProfileRepoSupabase(supabase, "t1", "default");

    await repo.get();

    expect(schema).toHaveBeenCalledWith("module_company_profile");
    expect(from).toHaveBeenCalledWith("settings");
  });

  it("get returns empty object when no row exists", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      }),
    };

    const { supabase } = makeSupabaseWithFromSequence([builder]);
    const repo = createCompanyProfileRepoSupabase(
      supabase,
      "tenant-1",
      "default"
    );
    const result = await repo.get();

    expect(result).toEqual({});
  });

  it("get maps row fields to CompanyProfileSettings", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          tenant_id: "t1",
          scope_id: "default",
          brand_name: "engrd.",
          name: "Engrd GmbH",
          email: "office@engrd.test",
          logo_url: null,
          address_street: null,
        },
        error: null,
      }),
    };

    const { supabase } = makeSupabaseWithFromSequence([builder]);
    const repo = createCompanyProfileRepoSupabase(supabase, "t1", "default");
    const result = await repo.get();

    expect(result).toMatchObject({
      brand_name: "engrd.",
      name: "Engrd GmbH",
      email: "office@engrd.test",
    });
  });

  it("set upserts with tenant_id and scope_id and throws on Supabase error", async () => {
    const upsertBuilder = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Invalid schema: module_company_profile" },
      }),
    };

    const { supabase } = makeSupabaseWithFromSequence([upsertBuilder]);
    const repo = createCompanyProfileRepoSupabase(
      supabase,
      "tenant-1",
      "default"
    );

    await expect(repo.set({ brand_name: "Test" })).rejects.toThrow(
      "Failed to save company profile: Invalid schema: module_company_profile"
    );
  });

  it("set returns updated data on success", async () => {
    const savedRow = {
      tenant_id: "t1",
      scope_id: "default",
      brand_name: "engrd.",
      name: "Engrd GmbH",
    };

    const upsertBuilder = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: savedRow,
        error: null,
      }),
    };

    const getBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: savedRow,
        error: null,
      }),
    };

    const { supabase } = makeSupabaseWithFromSequence([
      upsertBuilder,
      getBuilder,
    ]);
    const repo = createCompanyProfileRepoSupabase(supabase, "t1", "default");
    const result = await repo.set({
      brand_name: "engrd.",
      name: "Engrd GmbH",
    });

    expect(result).toMatchObject({
      brand_name: "engrd.",
      name: "Engrd GmbH",
    });
  });

  it("merge keeps existing fields and overrides only the provided keys", async () => {
    const existing = {
      tenant_id: "t1",
      scope_id: "default",
      name: "Engrd GmbH",
      brand_name: "engrd.",
      logo_url: "https://cdn.test/old.png",
    };
    const merged = { ...existing, name: "Engrd Holding GmbH" };

    const getCurrentBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: existing, error: null }),
    };
    const upsertBuilder = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: merged, error: null }),
    };
    const getAfterBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: merged, error: null }),
    };

    const { supabase } = makeSupabaseWithFromSequence([
      getCurrentBuilder,
      upsertBuilder,
      getAfterBuilder,
    ]);
    const repo = createCompanyProfileRepoSupabase(supabase, "t1", "default");

    const result = await repo.merge({ name: "Engrd Holding GmbH" });

    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Engrd Holding GmbH",
        brand_name: "engrd.",
        logo_url: "https://cdn.test/old.png",
      }),
      { onConflict: "tenant_id,scope_id" }
    );
    expect(result).toMatchObject({
      name: "Engrd Holding GmbH",
      brand_name: "engrd.",
    });
  });
});
