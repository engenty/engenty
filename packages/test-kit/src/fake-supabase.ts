/**
 * Canonical chainable PostgREST fake for unit tests.
 *
 * Unlike the historical per-package copies, filters are actually applied:
 * `eq`/`in`/`order`/`range`/… run against the seeded rows, so a query with a
 * wrong filter returns the wrong rows instead of silently passing. Mutations
 * (`insert`/`upsert`/`update`/`delete`) modify the in-memory store.
 *
 * Every call is still recorded per table for boundary assertions where the
 * call itself is the contract (e.g. tenant scoping).
 */

export interface FakeCall {
  args: unknown[];
  method: string;
}

export interface FakeQueryError {
  message: string;
}

type Row = Record<string, unknown>;

interface Filter {
  apply: (row: Row) => boolean;
}

interface OrderSpec {
  ascending: boolean;
  column: string;
}

export type FakeRpcHandler = (args: Record<string, unknown>) => unknown;

export interface CreateFakeSupabaseOptions {
  /** Handler per rpc function name; its return value becomes `data`. */
  rpc?: Record<string, FakeRpcHandler>;
  /** Single canned rpc payload returned for every rpc call without a handler. */
  rpcData?: unknown;
  /** Seed rows per table. The store is mutable via insert/update/delete. */
  tables?: Record<string, Row[]>;
}

export interface FakeQueryResult {
  data: unknown;
  error: FakeQueryError | null;
}

/** Chainable query surface mirroring the PostgREST builder used in app code. */
export interface FakeQueryBuilder extends PromiseLike<FakeQueryResult> {
  contains(column: string, value: unknown): FakeQueryBuilder;
  delete(): FakeQueryBuilder;
  eq(column: string, value: unknown): FakeQueryBuilder;
  gt(column: string, value: unknown): FakeQueryBuilder;
  gte(column: string, value: unknown): FakeQueryBuilder;
  ilike(column: string, pattern: string): FakeQueryBuilder;
  in(column: string, values: unknown[]): FakeQueryBuilder;
  insert(values: Row | Row[]): FakeQueryBuilder;
  is(column: string, value: unknown): FakeQueryBuilder;
  like(column: string, pattern: string): FakeQueryBuilder;
  limit(count: number): FakeQueryBuilder;
  lt(column: string, value: unknown): FakeQueryBuilder;
  lte(column: string, value: unknown): FakeQueryBuilder;
  maybeSingle(): FakeQueryBuilder;
  neq(column: string, value: unknown): FakeQueryBuilder;
  not(column: string, op: string, value: unknown): FakeQueryBuilder;
  or(condition: string): FakeQueryBuilder;
  order(column: string, opts?: { ascending?: boolean }): FakeQueryBuilder;
  range(from: number, to: number): FakeQueryBuilder;
  select(columns?: string, opts?: unknown): FakeQueryBuilder;
  single(): FakeQueryBuilder;
  update(values: Row): FakeQueryBuilder;
  upsert(values: Row | Row[]): FakeQueryBuilder;
}

function compileOrCondition(condition: string): Filter {
  // PostgREST `or("a.eq.1,b.is.null,c.in.(x,y)")` — split on top-level commas.
  const parts = condition.split(/,(?![^()]*\))/);
  const filters = parts.map((part): Filter => {
    const match = part.match(/^([^.]+)\.(not\.)?([a-z]+)\.(.*)$/);
    if (!match) {
      throw new Error(`fake-supabase: unsupported or() condition: ${part}`);
    }
    const [, column, negate, op, raw] = match;
    const base = compileFilter(op, column, parseOrValue(op, raw));
    return negate ? { apply: (row) => !base.apply(row) } : base;
  });
  return { apply: (row) => filters.some((filter) => filter.apply(row)) };
}

function parseOrValue(op: string, raw: string): unknown {
  if (op === "in") {
    return raw
      .replace(/^\(/, "")
      .replace(/\)$/, "")
      .split(",")
      .map((value) => value.replace(/^"|"$/g, ""));
  }
  if (raw === "null") {
    return null;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return raw;
}

/** Loose equality for or()-parsed string values; strict for direct JS values. */
function matches(rowValue: unknown, filterValue: unknown, loose = false) {
  if (rowValue === filterValue) {
    return true;
  }
  return loose && String(rowValue) === String(filterValue);
}

function compileFilter(op: string, column: string, value: unknown): Filter {
  const loose = typeof value === "string";
  switch (op) {
    case "eq":
      return { apply: (row) => matches(row[column], value, loose) };
    case "neq":
      return { apply: (row) => !matches(row[column], value, loose) };
    case "is":
      return { apply: (row) => (row[column] ?? null) === value };
    case "in": {
      const list = Array.isArray(value) ? value : [value];
      return {
        apply: (row) => list.some((item) => matches(row[column], item, loose)),
      };
    }
    case "gt":
      return { apply: (row) => (row[column] as never) > (value as never) };
    case "gte":
      return { apply: (row) => (row[column] as never) >= (value as never) };
    case "lt":
      return { apply: (row) => (row[column] as never) < (value as never) };
    case "lte":
      return { apply: (row) => (row[column] as never) <= (value as never) };
    case "like":
    case "ilike": {
      const pattern = new RegExp(
        `^${String(value)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replaceAll("%", ".*")}$`,
        op === "ilike" ? "i" : undefined
      );
      return { apply: (row) => pattern.test(String(row[column])) };
    }
    case "contains":
      return {
        apply: (row) => {
          const rowValue = row[column];
          if (Array.isArray(rowValue) && Array.isArray(value)) {
            return value.every((item) =>
              rowValue.some((candidate) => matches(candidate, item))
            );
          }
          if (
            rowValue &&
            value &&
            typeof rowValue === "object" &&
            typeof value === "object"
          ) {
            return Object.entries(value as Row).every(([key, expected]) =>
              matches((rowValue as Row)[key], expected)
            );
          }
          return false;
        },
      };
    default:
      throw new Error(`fake-supabase: unsupported filter op: ${op}`);
  }
}

interface PendingMutation {
  type: "delete" | "insert" | "update" | "upsert";
  values?: Row | Row[];
}

export function createFakeSupabase(options: CreateFakeSupabaseOptions = {}) {
  const store = new Map<string, Row[]>();
  for (const [table, rows] of Object.entries(options.tables ?? {})) {
    store.set(
      table,
      rows.map((row) => ({ ...row }))
    );
  }
  const calls = new Map<string, FakeCall[]>();
  const queuedErrors = new Map<string, FakeQueryError[]>();
  const rpcCalls: { args: Record<string, unknown>; fn: string }[] = [];

  const rowsFor = (table: string): Row[] => {
    let rows = store.get(table);
    if (!rows) {
      rows = [];
      store.set(table, rows);
    }
    return rows;
  };
  const callsFor = (table: string): FakeCall[] => {
    let list = calls.get(table);
    if (!list) {
      list = [];
      calls.set(table, list);
    }
    return list;
  };

  function builderFor(table: string) {
    const filters: Filter[] = [];
    const orders: OrderSpec[] = [];
    let mutation: PendingMutation | null = null;
    let rangeSpec: { from: number; to: number } | null = null;
    let limitCount: number | null = null;
    let singleMode: "maybeSingle" | "single" | null = null;

    const record = (method: string, args: unknown[]) => {
      callsFor(table).push({ args, method });
    };

    function execute(): { data: unknown; error: FakeQueryError | null } {
      const queued = queuedErrors.get(table);
      if (queued?.length) {
        return { data: null, error: queued.shift() ?? null };
      }
      const all = rowsFor(table);
      const matching = all.filter((row) =>
        filters.every((filter) => filter.apply(row))
      );

      let resultRows: Row[];
      if (mutation?.type === "insert" || mutation?.type === "upsert") {
        const incoming = (
          Array.isArray(mutation.values) ? mutation.values : [mutation.values]
        ).filter((row): row is Row => !!row);
        resultRows = [];
        for (const row of incoming) {
          const existingIndex =
            mutation.type === "upsert" && row.id !== undefined
              ? all.findIndex((candidate) => candidate.id === row.id)
              : -1;
          if (existingIndex >= 0) {
            all[existingIndex] = { ...all[existingIndex], ...row };
            resultRows.push(all[existingIndex]);
          } else {
            const inserted = { ...row };
            all.push(inserted);
            resultRows.push(inserted);
          }
        }
      } else if (mutation?.type === "update") {
        resultRows = matching.map((row) => {
          Object.assign(row, mutation?.values);
          return row;
        });
      } else if (mutation?.type === "delete") {
        for (const row of matching) {
          const index = all.indexOf(row);
          if (index >= 0) {
            all.splice(index, 1);
          }
        }
        resultRows = matching;
      } else {
        resultRows = [...matching];
      }

      for (const order of [...orders].reverse()) {
        resultRows.sort((a, b) => {
          const left = a[order.column] as never;
          const right = b[order.column] as never;
          if (left === right) {
            return 0;
          }
          const cmp = left > right ? 1 : -1;
          return order.ascending ? cmp : -cmp;
        });
      }
      if (rangeSpec) {
        resultRows = resultRows.slice(rangeSpec.from, rangeSpec.to + 1);
      }
      if (limitCount !== null) {
        resultRows = resultRows.slice(0, limitCount);
      }

      if (singleMode) {
        if (resultRows.length === 0) {
          return singleMode === "maybeSingle"
            ? { data: null, error: null }
            : { data: null, error: { message: "no rows returned" } };
        }
        if (resultRows.length > 1) {
          return {
            data: null,
            error: { message: "more than one row returned" },
          };
        }
        return { data: resultRows[0], error: null };
      }
      return { data: resultRows, error: null };
    }

    const builder: Record<string, unknown> = {};
    const chain =
      (method: string, effect?: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        record(method, args);
        effect?.(...args);
        return builder;
      };

    builder.select = chain("select");
    builder.eq = chain("eq", (column, value) => {
      filters.push(compileFilter("eq", String(column), value));
    });
    builder.neq = chain("neq", (column, value) => {
      filters.push(compileFilter("neq", String(column), value));
    });
    builder.in = chain("in", (column, value) => {
      filters.push(compileFilter("in", String(column), value));
    });
    builder.is = chain("is", (column, value) => {
      filters.push(compileFilter("is", String(column), value));
    });
    builder.gt = chain("gt", (column, value) => {
      filters.push(compileFilter("gt", String(column), value));
    });
    builder.gte = chain("gte", (column, value) => {
      filters.push(compileFilter("gte", String(column), value));
    });
    builder.lt = chain("lt", (column, value) => {
      filters.push(compileFilter("lt", String(column), value));
    });
    builder.lte = chain("lte", (column, value) => {
      filters.push(compileFilter("lte", String(column), value));
    });
    builder.like = chain("like", (column, value) => {
      filters.push(compileFilter("like", String(column), value));
    });
    builder.ilike = chain("ilike", (column, value) => {
      filters.push(compileFilter("ilike", String(column), value));
    });
    builder.contains = chain("contains", (column, value) => {
      filters.push(compileFilter("contains", String(column), value));
    });
    builder.not = chain("not", (column, op, value) => {
      const base = compileFilter(String(op), String(column), value);
      filters.push({ apply: (row) => !base.apply(row) });
    });
    builder.or = chain("or", (condition) => {
      filters.push(compileOrCondition(String(condition)));
    });
    builder.order = chain("order", (column, opts) => {
      orders.push({
        ascending:
          (opts as { ascending?: boolean } | undefined)?.ascending !== false,
        column: String(column),
      });
    });
    builder.limit = chain("limit", (count) => {
      limitCount = Number(count);
    });
    builder.range = chain("range", (from, to) => {
      rangeSpec = { from: Number(from), to: Number(to) };
    });
    builder.insert = chain("insert", (values) => {
      mutation = { type: "insert", values: values as Row | Row[] };
    });
    builder.upsert = chain("upsert", (values) => {
      mutation = { type: "upsert", values: values as Row | Row[] };
    });
    builder.update = chain("update", (values) => {
      mutation = { type: "update", values: values as Row };
    });
    builder.delete = chain("delete", () => {
      mutation = { type: "delete" };
    });
    builder.single = chain("single", () => {
      singleMode = "single";
    });
    builder.maybeSingle = chain("maybeSingle", () => {
      singleMode = "maybeSingle";
    });
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable Supabase query fake
    builder.then = (
      resolve: (value: FakeQueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(execute()).then(resolve, reject);
    return builder as unknown as FakeQueryBuilder;
  }

  const schemaApi = {
    from: (table: string) => builderFor(table),
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ args, fn });
      const handler = options.rpc?.[fn];
      const data = handler ? handler(args) : (options.rpcData ?? null);
      return Promise.resolve({ data, error: null });
    },
  };

  return {
    /** Per-table recorded calls — for boundary assertions only. */
    calls,
    from: schemaApi.from,
    /** Rows currently in a table (live reference to the mutable store). */
    getRows: (table: string) => rowsFor(table),
    /** Queue an error for the next awaited query on a table. */
    queueError: (table: string, message: string) => {
      const list = queuedErrors.get(table) ?? [];
      list.push({ message });
      queuedErrors.set(table, list);
    },
    rpc: schemaApi.rpc,
    rpcCalls,
    schema: (_name?: string) => schemaApi,
    /** Replace a table's rows. */
    setRows: (table: string, rows: Row[]) => {
      store.set(
        table,
        rows.map((row) => ({ ...row }))
      );
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
