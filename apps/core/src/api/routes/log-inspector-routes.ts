import fs from "node:fs";
import path from "node:path";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getEvlogLogDir } from "../../observability/evlog.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const AGENTS_FILE_ID = "agents";
const AGENTS_LOG_FILENAME = "agents.log";
const MAX_LIMIT = 500;

function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringValue(v: unknown): string {
  if (v == null) {
    return "";
  }
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return JSON.stringify(v);
}

function entryMatchesSearch(
  entry: Record<string, unknown>,
  search: string
): boolean {
  const lower = search.toLowerCase();
  for (const value of Object.values(entry)) {
    if (stringValue(value).toLowerCase().includes(lower)) {
      return true;
    }
  }
  return false;
}

export function registerLogInspectorRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
}) {
  const { app, config } = params;

  app.get("/api/logs/files", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const logDir = getEvlogLogDir();
    if (!fs.existsSync(logDir)) {
      return jsonApiSuccess(c, { files: [] });
    }

    const names = fs.readdirSync(logDir, { withFileTypes: true });
    const dates = new Set<string>();
    for (const dirent of names) {
      if (!(dirent.isFile() && dirent.name.endsWith(".jsonl"))) {
        continue;
      }
      const base = dirent.name.replace(/\.jsonl$/, "");
      const match = base.match(/^(\d{4}-\d{2}-\d{2})(?:\.\d+)?$/);
      if (match) {
        dates.add(match[1]);
      }
    }

    const files: { date: string; label?: string }[] = [];
    if (
      fs.existsSync(path.join(logDir, AGENTS_LOG_FILENAME)) &&
      fs.statSync(path.join(logDir, AGENTS_LOG_FILENAME)).isFile()
    ) {
      files.push({ date: AGENTS_FILE_ID, label: "Agents (AI debug)" });
    }
    const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));
    for (const date of sortedDates) {
      files.push({ date });
    }

    return jsonApiSuccess(c, { files });
  });

  app.get("/api/logs/entries", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const dateParam = c.req.query("date");
    if (
      !dateParam ||
      (dateParam !== AGENTS_FILE_ID && !DATE_ONLY_REGEX.test(dateParam))
    ) {
      return jsonApiError(c, 400, {
        message: "Invalid or missing date (use YYYY-MM-DD or 'agents')",
      });
    }

    const search = (c.req.query("search") ?? "").trim();
    const level = (c.req.query("level") ?? "").trim();
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(0, Number(c.req.query("limit")) || 100)
    );
    const offset = Math.max(0, Number(c.req.query("offset")) || 0);

    const logDir = getEvlogLogDir();
    const filePath =
      dateParam === AGENTS_FILE_ID
        ? path.join(logDir, AGENTS_LOG_FILENAME)
        : path.join(logDir, `${dateParam}.jsonl`);

    if (!(fs.existsSync(filePath) && fs.statSync(filePath).isFile())) {
      return jsonApiSuccess(c, { entries: [], total: 0 });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const all: Record<string, unknown>[] = [];

    for (const line of lines) {
      const entry = parseJsonLine(line);
      if (!entry) {
        continue;
      }
      if (search && !entryMatchesSearch(entry, search)) {
        continue;
      }
      const entryLevel = stringValue(entry.level || "info").toLowerCase();
      if (level && entryLevel !== level.toLowerCase()) {
        continue;
      }
      all.push(entry);
    }

    const total = all.length;
    all.reverse();
    const entries = all.slice(offset, offset + limit);

    return jsonApiSuccess(c, { entries, total });
  });
}
