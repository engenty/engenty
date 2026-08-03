import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * In-memory stand-in for the service-role client behind the approval store.
 *
 * The approval DAL is thin — filters, an insert, a conditional update and a
 * conditional delete — so the behaviour worth testing is that logic, not
 * PostgREST. This double implements exactly the query shapes `dal/approvals.ts`
 * builds; anything else throws rather than silently returning empty, so a new
 * query shape fails loudly here instead of passing a test it never ran.
 */

type Row = Record<string, unknown>;

interface Filter {
  // "eq-or-null": column equals the value OR is null (the actor disjunction).
  column: string;
  op: "eq" | "eq-or-null" | "gt" | "in";
  value: unknown;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    if (f.op === "eq") {
      return row[f.column] === f.value;
    }
    if (f.op === "eq-or-null") {
      return row[f.column] === f.value || row[f.column] === null;
    }
    if (f.op === "in") {
      return (f.value as unknown[]).includes(row[f.column]);
    }
    return String(row[f.column]) > String(f.value);
  });
}

export interface FakeApprovalDb {
  client: SupabaseClient;
  tables: Record<string, Row[]>;
}

export function createFakeApprovalDb(
  seed: Record<string, Row[]> = {}
): FakeApprovalDb {
  const tables: Record<string, Row[]> = {
    approval_grants: [...(seed.approval_grants ?? [])],
    approval_requests: [...(seed.approval_requests ?? [])],
  };
  let idCounter = 0;

  function from(table: string) {
    const rows = tables[table];
    if (!rows) {
      throw new Error(`fake db: unknown table ${table}`);
    }
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    let orderColumn: string | null = null;
    let orderAscending = true;
    let limitCount: number | null = null;

    function apply(): Row[] {
      if (mode === "insert") {
        idCounter += 1;
        const row: Row = {
          created_at: new Date(1e12 + idCounter).toISOString(),
          id: `row-${idCounter}`,
          ...payload,
        };
        rows.push(row);
        return [row];
      }
      const hit = rows.filter((row) => matches(row, filters));
      if (mode === "update") {
        for (const row of hit) {
          Object.assign(row, payload);
        }
      }
      if (mode === "delete") {
        for (const row of hit) {
          rows.splice(rows.indexOf(row), 1);
        }
      }
      const sortBy = orderColumn;
      if (sortBy) {
        hit.sort((a, b) => String(a[sortBy]).localeCompare(String(b[sortBy])));
        if (!orderAscending) {
          hit.reverse();
        }
      }
      return limitCount === null ? hit : hit.slice(0, limitCount);
    }

    const builder = {
      delete() {
        mode = "delete";
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, op: "eq", value });
        return builder;
      },
      gt(column: string, value: unknown) {
        filters.push({ column, op: "gt", value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push({ column, op: "in", value: values });
        return builder;
      },
      // Only the disjunction shape the store actually uses:
      // "col.eq.<value>,col.is.null" (actor match OR actor-agnostic).
      or(expression: string) {
        const clauses = expression.split(",");
        const eqClause = clauses.find((c) => c.includes(".eq."));
        const isNullClause = clauses.find((c) => c.endsWith(".is.null"));
        if (!(eqClause && isNullClause) || clauses.length !== 2) {
          throw new Error(`fake db: unsupported or() expression ${expression}`);
        }
        const [column, , ...valueParts] = eqClause.split(".");
        filters.push({
          column: column as string,
          op: "eq-or-null",
          value: valueParts.join("."),
        });
        return builder;
      },
      insert(values: Row) {
        mode = "insert";
        payload = values;
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: apply()[0] ?? null, error: null });
      },
      limit(count: number) {
        limitCount = count;
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        orderColumn = column;
        orderAscending = opts?.ascending !== false;
        return builder;
      },
      select() {
        return builder;
      },
      single() {
        const row = apply()[0];
        return Promise.resolve(
          row
            ? { data: row, error: null }
            : { data: null, error: new Error("no rows") }
        );
      },
      // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve({ data: apply(), error: null }).then(resolve);
      },
      update(values: Row) {
        mode = "update";
        payload = values;
        return builder;
      },
    };
    return builder;
  }

  return {
    client: { schema: () => ({ from }) } as unknown as SupabaseClient,
    tables,
  };
}
