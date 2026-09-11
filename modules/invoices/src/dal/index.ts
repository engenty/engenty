import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Database } from "sql.js";
import initSqlJs from "sql.js";
import { uuidv7 } from "uuidv7";
import {
  DEFAULT_INVOICE_SETTINGS,
  formatInvoiceNumber,
  parseInvoiceDisplayNumber,
} from "../lib/invoice-commercial.js";
import type {
  Invoice,
  InvoiceBlock,
  InvoiceBlockInput,
  InvoiceInput,
  InvoiceRecipientSnapshot,
  InvoiceSettings,
  InvoiceSettingsInput,
  InvoiceStatus,
} from "../schema/types.js";
import { invoiceFilePath, yearFromDate } from "./pathing.js";

export type { Invoice, InvoiceInput } from "../schema/types.js";

const SERVER_FIRST_ONLY =
  "Block editing and the invoice lifecycle require server-first (Supabase) mode.";

export function createInvoiceRepo(dataDir: string) {
  const resolved = path.resolve(dataDir);
  const dbPath = path.join(resolved, "index.db");
  let db: Database | null = null;

  function ensureDirSync(p: string) {
    fs.mkdirSync(p, { recursive: true });
  }

  async function ensureDir(p: string) {
    await fsp.mkdir(p, { recursive: true });
  }

  async function getDb(): Promise<Database> {
    if (db) {
      return db;
    }
    ensureDirSync(resolved);
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      const buf = await fsp.readFile(dbPath);
      db = new SQL.Database(buf);
    } else {
      db = new SQL.Database();
    }
    db.run(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        date TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        content TEXT NOT NULL,
        sumNetto REAL NOT NULL,
        tax REAL NOT NULL,
        sumBrutto REAL NOT NULL,
        clientId TEXT,
        recipientSnapshot TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT
      )
    `);
    // Lightweight migration path for existing databases created before recipient fields.
    try {
      db.run("ALTER TABLE invoices ADD COLUMN clientId TEXT");
    } catch {
      /* ignore */
    }
    try {
      db.run("ALTER TABLE invoices ADD COLUMN recipientSnapshot TEXT");
    } catch {
      /* ignore */
    }
    try {
      db.run("ALTER TABLE invoices ADD COLUMN updatedAt TEXT");
    } catch {
      /* ignore */
    }
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_invoices_clientId ON invoices(clientId)"
    );
    return db;
  }

  async function saveDb() {
    if (!db) {
      return;
    }
    const data = db.export();
    await fsp.writeFile(dbPath, Buffer.from(data));
  }

  function filePath(inv: { number: string; date: string }): string {
    return invoiceFilePath(resolved, inv);
  }

  function yearDir(year: string): string {
    return path.join(resolved, year);
  }

  function rowToInvoice(cols: string[], row: unknown[]): Invoice {
    const o: Record<string, unknown> = {};
    cols.forEach((c: string, i: number) => (o[c] = row[i]));
    let recipientSnapshot: InvoiceRecipientSnapshot | undefined;
    const snapshotRaw = o.recipientSnapshot;
    if (typeof snapshotRaw === "string" && snapshotRaw.length > 0) {
      try {
        recipientSnapshot = JSON.parse(snapshotRaw) as InvoiceRecipientSnapshot;
      } catch {
        recipientSnapshot = undefined;
      }
    }
    return {
      id: String(o.id),
      number: String(o.number),
      date: String(o.date),
      dueDate: String(o.dueDate),
      content: typeof o.content === "string" ? o.content : undefined,
      sumNetto: Number(o.sumNetto),
      tax: Number(o.tax),
      sumBrutto: Number(o.sumBrutto),
      clientId:
        typeof o.clientId === "string" && o.clientId.length > 0
          ? o.clientId
          : undefined,
      recipientSnapshot,
      createdAt: String(o.createdAt),
      // Falls back on rows written before the column existed; every write since
      // sets it, so the version token still advances on edit.
      updatedAt: String(o.updatedAt ?? o.createdAt),
      // Local SQL.js fallback predates the commercial columns: treat all as draft.
      status: "draft",
    };
  }

  async function collectInvoiceJsonFiles(dir: string): Promise<string[]> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectInvoiceJsonFiles(fullPath)));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  function isInvoiceRecord(value: unknown): value is Invoice {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.number === "string" &&
      typeof candidate.date === "string" &&
      typeof candidate.dueDate === "string" &&
      typeof candidate.content === "string" &&
      typeof candidate.sumNetto === "number" &&
      typeof candidate.tax === "number" &&
      typeof candidate.sumBrutto === "number" &&
      typeof candidate.createdAt === "string"
    );
  }

  async function rebuildIndexFromFilesIfEmpty(d: Database): Promise<void> {
    const countResult = d.exec("SELECT COUNT(*) as count FROM invoices");
    const count = Number(countResult[0]?.values?.[0]?.[0] ?? 0);
    if (count > 0) {
      return;
    }

    const files = await collectInvoiceJsonFiles(resolved).catch(() => []);
    let inserted = 0;
    for (const file of files) {
      const raw = await fsp.readFile(file, "utf-8").catch(() => "");
      if (!raw) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!isInvoiceRecord(parsed)) {
        continue;
      }
      const invoice = parsed;
      d.run(
        `INSERT OR IGNORE INTO invoices
          (id, number, date, dueDate, content, sumNetto, tax, sumBrutto, clientId, recipientSnapshot, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.id,
          invoice.number,
          invoice.date,
          invoice.dueDate,
          invoice.content,
          invoice.sumNetto,
          invoice.tax,
          invoice.sumBrutto,
          invoice.clientId ?? null,
          invoice.recipientSnapshot
            ? JSON.stringify(invoice.recipientSnapshot)
            : null,
          invoice.createdAt,
          invoice.updatedAt ?? invoice.createdAt,
        ]
      );
      inserted += 1;
    }
    if (inserted > 0) {
      await saveDb();
    }
  }

  return {
    async create(input: InvoiceInput): Promise<Invoice> {
      const id = uuidv7();
      const createdAt = new Date().toISOString();
      const invoice: Invoice = {
        ...input,
        id,
        createdAt,
        updatedAt: createdAt,
        status: input.status ?? "draft",
      };

      const year = yearFromDate(input.date);
      await ensureDir(yearDir(year));
      const fp = filePath(invoice);
      await fsp.writeFile(fp, JSON.stringify(invoice, null, 2), "utf-8");

      const d = await getDb();
      d.run(
        `INSERT INTO invoices (id, number, date, dueDate, content, sumNetto, tax, sumBrutto, clientId, recipientSnapshot, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.number,
          input.date,
          input.dueDate,
          input.content ?? "",
          input.sumNetto,
          input.tax,
          input.sumBrutto,
          input.clientId ?? null,
          input.recipientSnapshot
            ? JSON.stringify(input.recipientSnapshot)
            : null,
          createdAt,
          createdAt,
        ]
      );
      await saveDb();

      return invoice;
    },

    async list(): Promise<Invoice[]> {
      const d = await getDb();
      await rebuildIndexFromFilesIfEmpty(d);
      const result = d.exec(
        `SELECT id, number, date, dueDate, content, sumNetto, tax, sumBrutto, clientId, recipientSnapshot, createdAt, updatedAt
         FROM invoices ORDER BY date DESC`
      );
      if (!result.length) {
        return [];
      }
      const cols = result[0].columns as string[];
      return result[0].values.map((row: unknown[]) => rowToInvoice(cols, row));
    },

    async getById(id: string): Promise<Invoice | null> {
      const d = await getDb();
      await rebuildIndexFromFilesIfEmpty(d);
      const result = d.exec("SELECT * FROM invoices WHERE id = ?", [id]);
      if (!(result.length && result[0].values.length)) {
        return null;
      }
      const cols = result[0].columns as string[];
      const row = result[0].values[0] as unknown[];
      return rowToInvoice(cols, row);
    },

    async getByNumber(number: string): Promise<Invoice | null> {
      const d = await getDb();
      await rebuildIndexFromFilesIfEmpty(d);
      const result = d.exec("SELECT * FROM invoices WHERE number = ?", [
        number,
      ]);
      if (!(result.length && result[0].values.length)) {
        return null;
      }
      const cols = result[0].columns as string[];
      const row = result[0].values[0] as unknown[];
      return rowToInvoice(cols, row);
    },

    async get(idOrNumber: string): Promise<Invoice | null> {
      const byId = await this.getById(idOrNumber);
      if (byId) {
        return byId;
      }
      return this.getByNumber(idOrNumber);
    },

    async update(
      id: string,
      input: Omit<Partial<InvoiceInput>, "clientId" | "recipientSnapshot"> & {
        clientId?: string | null;
        recipientSnapshot?: InvoiceRecipientSnapshot | null;
      }
    ): Promise<Invoice | null> {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }

      const merged: Invoice = {
        ...existing,
        ...input,
        clientId:
          input.clientId === null
            ? undefined
            : (input.clientId ?? existing.clientId),
        recipientSnapshot:
          input.recipientSnapshot === null
            ? undefined
            : (input.recipientSnapshot ?? existing.recipientSnapshot),
        id: existing.id,
        createdAt: existing.createdAt,
        // Moves on every write — this is the token a concurrent editor's save
        // is checked against, so leaving it at the old value would turn a
        // conflict into a silent overwrite.
        updatedAt: new Date().toISOString(),
      };

      const year = yearFromDate(merged.date);
      await ensureDir(yearDir(year));
      const fp = filePath(merged);
      await fsp.writeFile(fp, JSON.stringify(merged, null, 2), "utf-8");

      const oldFp = filePath(existing);
      if (oldFp !== fp) {
        try {
          await fsp.unlink(oldFp);
        } catch {
          /* ignore */
        }
      }

      const d = await getDb();
      d.run(
        `UPDATE invoices
         SET number=?, date=?, dueDate=?, content=?, sumNetto=?, tax=?, sumBrutto=?, clientId=?, recipientSnapshot=?, updatedAt=?
         WHERE id=?`,
        [
          merged.number,
          merged.date,
          merged.dueDate,
          merged.content ?? "",
          merged.sumNetto,
          merged.tax,
          merged.sumBrutto,
          merged.clientId ?? null,
          merged.recipientSnapshot
            ? JSON.stringify(merged.recipientSnapshot)
            : null,
          merged.updatedAt,
          id,
        ]
      );
      await saveDb();

      return merged;
    },

    async delete(id: string): Promise<boolean> {
      const existing = await this.getById(id);
      if (!existing) {
        return false;
      }

      const fp = filePath(existing);
      try {
        await fsp.unlink(fp);
      } catch {
        /* ignore */
      }

      const d = await getDb();
      d.run("DELETE FROM invoices WHERE id = ?", [id]);
      await saveDb();
      return true;
    },

    async listByClient(clientId: string): Promise<Invoice[]> {
      const d = await getDb();
      await rebuildIndexFromFilesIfEmpty(d);
      const result = d.exec(
        `SELECT id, number, date, dueDate, content, sumNetto, tax, sumBrutto, clientId, recipientSnapshot, createdAt, updatedAt
         FROM invoices
         WHERE clientId = ?
         ORDER BY date DESC`,
        [clientId]
      );
      if (!result.length) {
        return [];
      }
      const cols = result[0].columns as string[];
      return result[0].values.map((row: unknown[]) => rowToInvoice(cols, row));
    },

    async countByClientIds(
      clientIds: string[]
    ): Promise<Record<string, number>> {
      const map: Record<string, number> = {};
      for (const id of clientIds) {
        map[id] = 0;
      }
      if (clientIds.length === 0) {
        return map;
      }
      const d = await getDb();
      await rebuildIndexFromFilesIfEmpty(d);
      const placeholders = clientIds.map(() => "?").join(", ");
      const result = d.exec(
        `SELECT clientId, COUNT(*) AS cnt FROM invoices WHERE clientId IN (${placeholders}) GROUP BY clientId`,
        clientIds
      );
      if (!(result.length && result[0].values?.length)) {
        return map;
      }
      const cols = result[0].columns as string[];
      const clientIdx = cols.indexOf("clientId");
      const cntIdx = cols.indexOf("cnt");
      if (clientIdx < 0 || cntIdx < 0) {
        return map;
      }
      for (const row of result[0].values as unknown[][]) {
        const cid = String(row[clientIdx]);
        map[cid] = Number(row[cntIdx]);
      }
      return map;
    },

    // --- Blocks / lifecycle: server-first only (degraded in local mode) ------

    async listBlocks(_invoiceId: string): Promise<InvoiceBlock[]> {
      return [];
    },

    async replaceBlocks(
      _invoiceId: string,
      _blocks: InvoiceBlockInput[]
    ): Promise<InvoiceBlock[]> {
      throw new Error(SERVER_FIRST_ONLY);
    },

    async issue(_id: string): Promise<Invoice | null> {
      throw new Error(SERVER_FIRST_ONLY);
    },

    async setStatus(
      _id: string,
      _status: InvoiceStatus,
      _extra?: { issuedAt?: string }
    ): Promise<Invoice | null> {
      throw new Error(SERVER_FIRST_ONLY);
    },

    async cancel(_id: string): Promise<{ original: Invoice; storno: Invoice }> {
      throw new Error(SERVER_FIRST_ONLY);
    },

    // --- Settings (defaults only; not persisted in local mode) ----------------

    async getSettings(): Promise<InvoiceSettings> {
      return { ...DEFAULT_INVOICE_SETTINGS };
    },

    async setSettings(input: InvoiceSettingsInput): Promise<InvoiceSettings> {
      return { ...DEFAULT_INVOICE_SETTINGS, ...input };
    },

    // --- Number generation ----------------------------------------------------

    async getNextNumber(settingsOverride?: InvoiceSettings): Promise<string> {
      const settings = settingsOverride ?? { ...DEFAULT_INVOICE_SETTINGS };
      const d = await getDb();
      await rebuildIndexFromFilesIfEmpty(d);
      const result = d.exec("SELECT number FROM invoices");
      let highest = settings.invoice_id_offset;
      if (result.length) {
        for (const row of result[0].values as unknown[][]) {
          const parsed = parseInvoiceDisplayNumber(String(row[0]));
          if (parsed != null && parsed > highest) {
            highest = parsed;
          }
        }
      }
      return formatInvoiceNumber(settings, highest + 1);
    },

    async numberExists(number: string, excludeId?: string): Promise<boolean> {
      const d = await getDb();
      await rebuildIndexFromFilesIfEmpty(d);
      const result = excludeId
        ? d.exec("SELECT id FROM invoices WHERE number = ? AND id != ?", [
            number,
            excludeId,
          ])
        : d.exec("SELECT id FROM invoices WHERE number = ?", [number]);
      return Boolean(result.length && result[0].values.length);
    },

    filePath(inv: Invoice): string {
      return filePath(inv);
    },
  };
}
