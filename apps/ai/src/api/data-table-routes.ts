import {
  coerceRowValues,
  mergeRowValues,
  TableColumnValueError,
  tableColumnsSchema,
} from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { AI_BASE_PATH } from "../config/constants.js";
import type { DataTableStore } from "../dal/data-tables/index.js";
import {
  type AiScopeResolver,
  handleRouteError,
  resolveScope,
} from "./http.js";

const createBodySchema = z.object({
  columns: tableColumnsSchema,
  space_id: z.string().uuid(),
  title: z.string().min(1).max(512),
});

const patchBodySchema = z.object({
  columns: tableColumnsSchema.optional(),
  title: z.string().min(1).max(512).optional(),
});

const insertBodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
});

const updateRowBodySchema = z.object({
  values: z.record(z.string(), z.unknown()),
});

const deleteRowsBodySchema = z.object({
  row_ids: z.array(z.string().uuid()).min(1).max(200),
});

export function registerDataTableRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: {
    scopeResolver: AiScopeResolver;
    tables: DataTableStore;
  }
): void {
  const base = `${AI_BASE_PATH}/data-tables`;

  app.post(base, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = createBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "data_tables.invalidBody" }, 400);
    }
    try {
      const table = await opts.tables.createTable({
        columns: body.data.columns,
        createdBy: scope.scope.userId,
        spaceId: body.data.space_id,
        tenantId: scope.scope.tenantId,
        title: body.data.title,
      });
      return c.json({ table }, 201);
    } catch (err) {
      return handleRouteError(
        c,
        "create data table failed",
        "data_tables.createFailed",
        err
      );
    }
  });

  app.get(`${base}/:id`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    try {
      const table = await opts.tables.getTable({
        tableId: c.req.param("id"),
        tenantId: scope.scope.tenantId,
      });
      if (!table) {
        return c.json({ error: "data_tables.notFound" }, 404);
      }
      const limit = Number(c.req.query("limit") ?? "200");
      const offset = Number(c.req.query("offset") ?? "0");
      const rows = await opts.tables.listRows({
        limit: Number.isFinite(limit) ? limit : 200,
        offset: Number.isFinite(offset) ? offset : 0,
        tableId: table.id,
        tenantId: scope.scope.tenantId,
      });
      return c.json({ rows, table });
    } catch (err) {
      return handleRouteError(
        c,
        "read data table failed",
        "data_tables.readFailed",
        err
      );
    }
  });

  app.patch(`${base}/:id`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = patchBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "data_tables.invalidBody" }, 400);
    }
    try {
      const existing = await opts.tables.getTable({
        tableId: c.req.param("id"),
        tenantId: scope.scope.tenantId,
      });
      if (!existing) {
        return c.json({ error: "data_tables.notFound" }, 404);
      }
      const table = await opts.tables.updateTable({
        ...(body.data.columns ? { columns: body.data.columns } : {}),
        tableId: existing.id,
        tenantId: scope.scope.tenantId,
        ...(body.data.title ? { title: body.data.title } : {}),
      });
      return c.json({ table });
    } catch (err) {
      return handleRouteError(
        c,
        "update data table failed",
        "data_tables.updateFailed",
        err
      );
    }
  });

  app.post(`${base}/:id/rows`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = insertBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "data_tables.invalidBody" }, 400);
    }
    try {
      const table = await opts.tables.getTable({
        tableId: c.req.param("id"),
        tenantId: scope.scope.tenantId,
      });
      if (!table) {
        return c.json({ error: "data_tables.notFound" }, 404);
      }
      const rows = await opts.tables.insertRows({
        rows: body.data.rows.map((values) =>
          coerceRowValues(table.columns, values)
        ),
        tableId: table.id,
        tenantId: scope.scope.tenantId,
      });
      return c.json({ rows }, 201);
    } catch (err) {
      if (err instanceof TableColumnValueError) {
        return c.json({ error: err.message, column_id: err.columnId }, 400);
      }
      return handleRouteError(
        c,
        "insert data table rows failed",
        "data_tables.insertFailed",
        err
      );
    }
  });

  app.patch(`${base}/:id/rows/:rowId`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = updateRowBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "data_tables.invalidBody" }, 400);
    }
    try {
      const table = await opts.tables.getTable({
        tableId: c.req.param("id"),
        tenantId: scope.scope.tenantId,
      });
      if (!table) {
        return c.json({ error: "data_tables.notFound" }, 404);
      }
      const existing = await opts.tables.getRow({
        rowId: c.req.param("rowId"),
        tableId: table.id,
        tenantId: scope.scope.tenantId,
      });
      if (!existing) {
        return c.json({ error: "data_tables.rowNotFound" }, 404);
      }
      const row = await opts.tables.updateRow({
        cells: mergeRowValues(table.columns, existing.cells, body.data.values),
        rowId: existing.id,
        tableId: table.id,
        tenantId: scope.scope.tenantId,
      });
      return c.json({ row });
    } catch (err) {
      if (err instanceof TableColumnValueError) {
        return c.json({ error: err.message, column_id: err.columnId }, 400);
      }
      return handleRouteError(
        c,
        "update data table row failed",
        "data_tables.rowUpdateFailed",
        err
      );
    }
  });

  app.delete(`${base}/:id/rows`, async (c) => {
    const scope = await resolveScope(c, opts.scopeResolver);
    if (!scope.ok) {
      return scope.response;
    }
    const body = deleteRowsBodySchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "data_tables.invalidBody" }, 400);
    }
    try {
      const table = await opts.tables.getTable({
        tableId: c.req.param("id"),
        tenantId: scope.scope.tenantId,
      });
      if (!table) {
        return c.json({ error: "data_tables.notFound" }, 404);
      }
      const deleted = await opts.tables.deleteRows({
        rowIds: body.data.row_ids,
        tableId: table.id,
        tenantId: scope.scope.tenantId,
      });
      return c.json({ deleted });
    } catch (err) {
      return handleRouteError(
        c,
        "delete data table rows failed",
        "data_tables.rowDeleteFailed",
        err
      );
    }
  });
}
