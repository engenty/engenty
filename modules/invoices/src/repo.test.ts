import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInvoiceRepo, type InvoiceInput } from "./dal/index";

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `engenty-invoices-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const sampleInput: InvoiceInput = {
  number: "INV-2025-001",
  date: "2025-02-18",
  dueDate: "2025-03-18",
  content: "Consulting services",
  sumNetto: 1000,
  tax: 190,
  sumBrutto: 1190,
};

describe("createInvoiceRepo", () => {
  let dataDir: string;
  let repo: ReturnType<typeof createInvoiceRepo>;

  beforeEach(() => {
    dataDir = makeTempDir();
    repo = createInvoiceRepo(dataDir);
  });

  afterEach(() => {
    if (dataDir && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("create returns invoice with id and createdAt", async () => {
    const inv = await repo.create(sampleInput);
    expect(inv.id).toBeDefined();
    expect(inv.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(inv.createdAt).toBeDefined();
    expect(inv.number).toBe(sampleInput.number);
    expect(inv.sumBrutto).toBe(sampleInput.sumBrutto);
  });

  it("create writes JSON file by year", async () => {
    const inv = await repo.create(sampleInput);
    const yearDir = path.join(dataDir, "2025");
    const jsonPath = path.join(yearDir, "INV-2025-001.json");
    expect(fs.existsSync(jsonPath)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    expect(raw.id).toBe(inv.id);
    expect(raw.number).toBe(inv.number);
  });

  it("list returns created invoices", async () => {
    const _a = await repo.create(sampleInput);
    const _b = await repo.create({
      ...sampleInput,
      number: "INV-2025-002",
      date: "2025-02-19",
    });
    const list = await repo.list();
    expect(list).toHaveLength(2);
    const numbers = list.map((i) => i.number).sort();
    expect(numbers).toEqual(["INV-2025-001", "INV-2025-002"]);
    expect(list[0].id).toBeDefined();
  });

  it("getById returns invoice", async () => {
    const created = await repo.create(sampleInput);
    const found = await repo.getById(created.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.number).toBe(created.number);
  });

  it("getByNumber returns invoice", async () => {
    await repo.create(sampleInput);
    const found = await repo.getByNumber("INV-2025-001");
    expect(found).not.toBeNull();
    expect(found?.number).toBe("INV-2025-001");
  });

  it("get finds by id or number", async () => {
    const created = await repo.create(sampleInput);
    expect(await repo.get(created.id)).not.toBeNull();
    expect(await repo.get("INV-2025-001")).not.toBeNull();
    expect(await repo.get("nonexistent")).toBeNull();
  });

  it("update modifies invoice", async () => {
    const created = await repo.create(sampleInput);
    const updated = await repo.update(created.id, {
      content: "Updated content",
      sumBrutto: 1500,
    });
    expect(updated).not.toBeNull();
    expect(updated?.content).toBe("Updated content");
    expect(updated?.sumBrutto).toBe(1500);
    expect(updated?.id).toBe(created.id);

    const found = await repo.getById(created.id);
    expect(found?.content).toBe("Updated content");
  });

  it("delete removes invoice", async () => {
    const created = await repo.create(sampleInput);
    const jsonPath = path.join(dataDir, "2025", "INV-2025-001.json");
    expect(fs.existsSync(jsonPath)).toBe(true);

    const ok = await repo.delete(created.id);
    expect(ok).toBe(true);
    expect(await repo.getById(created.id)).toBeNull();
    expect(fs.existsSync(jsonPath)).toBe(false);
  });

  it("delete returns false for nonexistent id", async () => {
    const ok = await repo.delete("01900000-0000-7000-8000-000000000000");
    expect(ok).toBe(false);
  });

  it("stores and filters linked client data", async () => {
    const a = await repo.create({
      ...sampleInput,
      number: "INV-2025-101",
      clientId: "01900000-0000-7000-8000-000000000010",
      recipientSnapshot: {
        clientId: "01900000-0000-7000-8000-000000000010",
        kind: "organization",
        displayName: "Acme GmbH",
        address: {
          street: "Main 1",
          postalCode: "1010",
          city: "Vienna",
          country: "AT",
        },
        capturedAt: new Date().toISOString(),
      },
    });
    await repo.create({
      ...sampleInput,
      number: "INV-2025-102",
      clientId: "01900000-0000-7000-8000-000000000011",
    });

    const filtered = await repo.listByClient(
      "01900000-0000-7000-8000-000000000010"
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(a.id);
    expect(filtered[0].recipientSnapshot?.displayName).toBe("Acme GmbH");

    const counts = await repo.countByClientIds([
      "01900000-0000-7000-8000-000000000010",
      "01900000-0000-7000-8000-000000000011",
      "01900000-0000-7000-8000-000000000099",
    ]);
    expect(counts["01900000-0000-7000-8000-000000000010"]).toBe(1);
    expect(counts["01900000-0000-7000-8000-000000000011"]).toBe(1);
    expect(counts["01900000-0000-7000-8000-000000000099"]).toBe(0);
  });

  it("rebuilds SQLite index from invoice JSON files when empty", async () => {
    const legacyInvoice = {
      id: "01900000-0000-7000-8000-000000000123",
      number: "INV-2025-LEGACY",
      date: "2025-02-20",
      dueDate: "2025-03-20",
      content: "Legacy invoice file",
      sumNetto: 200,
      tax: 40,
      sumBrutto: 240,
      createdAt: new Date().toISOString(),
    };
    const yearDir = path.join(dataDir, "2025");
    fs.mkdirSync(yearDir, { recursive: true });
    fs.writeFileSync(
      path.join(yearDir, "INV-2025-LEGACY.json"),
      JSON.stringify(legacyInvoice, null, 2),
      "utf-8"
    );

    const listed = await repo.list();
    expect(listed.some((item) => item.number === "INV-2025-LEGACY")).toBe(true);

    const found = await repo.get("INV-2025-LEGACY");
    expect(found?.id).toBe("01900000-0000-7000-8000-000000000123");
  });
});
