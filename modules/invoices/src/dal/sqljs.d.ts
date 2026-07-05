declare module "sql.js" {
  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }
  export interface Database {
    exec(
      sql: string,
      params?: unknown[] | Record<string, unknown>
    ): QueryExecResult[];
    export(): Uint8Array;
    run(sql: string, params?: unknown[] | Record<string, unknown>): Database;
  }
  export default function initSqlJs(config?: {
    locateFile?: (name: string) => string;
  }): Promise<{
    Database: new (data?: ArrayBuffer | Uint8Array) => Database;
  }>;
}
