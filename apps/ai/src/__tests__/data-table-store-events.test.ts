import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDataTableStore,
  DATA_TABLE_ROW_EVENTS,
} from "../dal/data-tables/data-table-store.js";
import {
  type AppEvent,
  onAppEvent,
  resetAppEventListenersForTests,
} from "../infra/app-events.js";
import { createRecordingDbSource } from "./helpers/recording-db-source.js";

const tenantId = "tenant-1";
const tableId = "table-1";
const spaceId = "space-1";

/**
 * Chainable supabase fake: every builder method returns the builder, the
 * terminal calls answer from what the test queued per table.
 */
function makeFake(opts: { deleted?: unknown[]; rows?: unknown[] }) {
  function builder(table: string) {
    const b: Record<string, unknown> = {
      delete: () => b,
      eq: () => b,
      in: () => b,
      insert: () => b,
      select: () => b,
      update: () => b,
      single: async () => ({ data: opts.rows?.[0] ?? null, error: null }),
      maybeSingle: async () => {
        if (table === "data_table") {
          return {
            data: {
              columns: [{ id: "x", name: "x", type: "text" }],
              id: tableId,
              space_id: spaceId,
              title: "T",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      // biome-ignore lint/suspicious/noThenProperty: the store awaits the builder after `.select()`, as supabase-js does
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data:
            table === "data_table_row" ? (opts.deleted ?? opts.rows ?? []) : [],
          error: null,
        }),
    };
    return b;
  }
  const client = {
    schema: () => ({ from: (table: string) => builder(table) }),
  } as unknown as SupabaseClient;
  return { client };
}

function collect(): AppEvent[] {
  const events: AppEvent[] = [];
  onAppEvent((event) => {
    events.push(event);
  });
  return events;
}

afterEach(() => {
  resetAppEventListenersForTests();
});

describe("data table row events", () => {
  it("raises one created event per insert call, stamped with the table's Space", async () => {
    const events = collect();
    const { client } = makeFake({
      rows: [
        { cells: { x: 1 }, id: "r1", table_id: tableId },
        { cells: { x: 2 }, id: "r2", table_id: tableId },
      ],
    });
    const store = createDataTableStore(createRecordingDbSource(client).source);

    await store.insertRows({ rows: [{ x: 1 }, { x: 2 }], tableId, tenantId });

    expect(events).toEqual([
      {
        payload: {
          row_ids: ["r1", "r2"],
          rows: [
            { cells: { x: 1 }, id: "r1" },
            { cells: { x: 2 }, id: "r2" },
          ],
          space_id: spaceId,
          table_id: tableId,
        },
        resource: DATA_TABLE_ROW_EVENTS.created,
        tenantId,
      },
    ]);
  });

  it("raises updated with the row's new cells", async () => {
    const events = collect();
    const { client } = makeFake({
      rows: [{ cells: { x: 3 }, id: "r1", table_id: tableId }],
    });
    const store = createDataTableStore(createRecordingDbSource(client).source);

    await store.updateRow({ cells: { x: 3 }, rowId: "r1", tableId, tenantId });

    expect(events).toEqual([
      {
        payload: {
          cells: { x: 3 },
          row_id: "r1",
          space_id: spaceId,
          table_id: tableId,
        },
        resource: DATA_TABLE_ROW_EVENTS.updated,
        tenantId,
      },
    ]);
  });

  it("raises deleted only when a row actually went", async () => {
    const events = collect();
    const gone = makeFake({ deleted: [{ id: "r1" }] });
    await createDataTableStore(
      createRecordingDbSource(gone.client).source
    ).deleteRows({
      rowIds: ["r1"],
      tableId,
      tenantId,
    });
    const nothing = makeFake({ deleted: [] });
    await createDataTableStore(
      createRecordingDbSource(nothing.client).source
    ).deleteRows({
      rowIds: ["r9"],
      tableId,
      tenantId,
    });

    expect(events).toEqual([
      {
        payload: { row_ids: ["r1"], space_id: spaceId, table_id: tableId },
        resource: DATA_TABLE_ROW_EVENTS.deleted,
        tenantId,
      },
    ]);
  });
});
