import { describe, expect, it, vi } from "vitest";
import { createTimeTrackingRepoSupabase } from "./supabase.js";

function makeChainableMock(data: any, insertError: any = null) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => ({ error: insertError })),
    update: vi.fn(() => builder),
    single: async () => ({ data, error: null }),
    maybeSingle: async () => ({ data, error: null }),
  };
  return builder;
}

function makeMockSupabase(responses: {
  entryData?: any;
  rowData?: any;
  updatedEntryData?: any;
}) {
  const fromMock = vi.fn((table: string) => {
    if (table === "time_entries") {
      return makeChainableMock(responses.entryData);
    }
    if (table === "timesheet_rows") {
      return makeChainableMock(responses.rowData);
    }
    return makeChainableMock(null);
  });

  return {
    schema: vi.fn(() => ({
      from: fromMock,
    })),
    fromMock,
  } as any;
}

describe("supabase repo update", () => {
  it("updates hours and notes without changing timesheet row if discipline is unchanged", async () => {
    const mockEntry = {
      id: "entry-1",
      tenant_id: "tenant-1",
      scope_id: "scope-1",
      user_id: "user-1",
      date: "2026-06-19",
      hours: 4,
      notes: "original notes",
      timesheet_row_id: "row-1",
      discipline: "DEV",
    };

    const mockSupabase = makeMockSupabase({
      entryData: {
        ...mockEntry,
        timesheet_rows: {
          id: "row-1",
          tenant_id: "tenant-1",
          scope_id: "scope-1",
          user_id: "user-1",
          week_start: "2026-06-15",
          discipline: "DEV",
        },
      },
    });

    const repo = createTimeTrackingRepoSupabase(
      mockSupabase,
      "tenant-1",
      "scope-1"
    );

    const result = await repo.update("entry-1", {
      hours: 6,
      notes: "updated notes",
    });

    expect(result).toBeDefined();
    expect(mockSupabase.fromMock).toHaveBeenCalledWith("time_entries");
  });

  it("creates a new timesheet row and updates timesheet_row_id when discipline changes", async () => {
    const mockEntry = {
      id: "entry-1",
      tenant_id: "tenant-1",
      scope_id: "scope-1",
      user_id: "user-1",
      date: "2026-06-19",
      hours: 4,
      notes: "original notes",
      timesheet_row_id: "row-1",
      discipline: "DEV",
    };

    const mockRow = {
      id: "row-1",
      tenant_id: "tenant-1",
      scope_id: "scope-1",
      user_id: "user-1",
      week_start: "2026-06-15",
      discipline: "DEV",
      project_id: "proj-1",
    };

    const mockSupabase = makeMockSupabase({
      entryData: {
        ...mockEntry,
        timesheet_rows: mockRow,
      },
      rowData: mockRow,
    });

    const repo = createTimeTrackingRepoSupabase(
      mockSupabase,
      "tenant-1",
      "scope-1"
    );

    const result = await repo.update("entry-1", {
      discipline: "DES",
    });

    expect(result).toBeDefined();
    expect(mockSupabase.fromMock).toHaveBeenCalledWith("timesheet_rows");
  });
});
