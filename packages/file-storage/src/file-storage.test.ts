import { describe, expect, it } from "vitest";
import { createFileStorageService } from "./file-storage-service.js";
import type { FileStorageProvider } from "./file-storage-types.js";

/** Creates an in-memory mock provider for testing */
function createMockProvider(): FileStorageProvider & {
  _files: Map<string, { data: Uint8Array; contentType?: string }>;
} {
  const files = new Map<string, { data: Uint8Array; contentType?: string }>();

  return {
    id: "mock",
    name: "Mock Provider",
    _files: files,

    async upload(key, data, opts) {
      const bytes =
        data instanceof Uint8Array
          ? data
          : data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(await (data as Blob).arrayBuffer());
      files.set(key, { data: bytes, contentType: opts?.contentType });
    },

    async download(key) {
      const entry = files.get(key);
      return entry ? entry.data : null;
    },

    async getUrl(key, opts) {
      if (opts?.signed) {
        return `https://mock.storage/signed/${key}?expires=${opts.expiresIn ?? 3600}`;
      }
      return `https://mock.storage/public/${key}`;
    },

    async delete(key) {
      files.delete(key);
    },

    async list(prefix, opts) {
      const allKeys = Array.from(files.keys());
      const matching = prefix
        ? allKeys.filter((k) => k.startsWith(prefix))
        : allKeys;

      const offset = opts?.offset ?? 0;
      const limit = opts?.limit ?? 100;
      const paged = matching.slice(offset, offset + limit);

      return {
        files: paged.map((k) => ({
          name: k.split("/").pop() ?? k,
          metadata: {},
        })),
        total: matching.length,
      };
    },

    async exists(key) {
      return files.has(key);
    },

    async copy(src, dest) {
      const entry = files.get(src);
      if (!entry) {
        throw new Error(`Source not found: ${src}`);
      }
      files.set(dest, { ...entry });
    },
  };
}

describe("FileStorageProvider contract", () => {
  it("mock provider satisfies FileStorageProvider interface shape", () => {
    const provider = createMockProvider();
    expect(provider.id).toBe("mock");
    expect(provider.name).toBe("Mock Provider");
    expect(typeof provider.upload).toBe("function");
    expect(typeof provider.download).toBe("function");
    expect(typeof provider.getUrl).toBe("function");
    expect(typeof provider.delete).toBe("function");
    expect(typeof provider.list).toBe("function");
    expect(typeof provider.exists).toBe("function");
    expect(typeof provider.copy).toBe("function");
  });

  it("upload + download roundtrip", async () => {
    const provider = createMockProvider();
    const data = new Uint8Array([1, 2, 3, 4]);
    await provider.upload("test/file.bin", data);
    const result = await provider.download("test/file.bin");
    expect(result).toEqual(data);
  });

  it("download returns null for missing files", async () => {
    const provider = createMockProvider();
    const result = await provider.download("nonexistent.txt");
    expect(result).toBeNull();
  });

  it("delete removes files", async () => {
    const provider = createMockProvider();
    await provider.upload("to-delete.txt", new Uint8Array([1]));
    expect(await provider.exists("to-delete.txt")).toBe(true);
    await provider.delete("to-delete.txt");
    expect(await provider.exists("to-delete.txt")).toBe(false);
  });

  it("list returns files under prefix", async () => {
    const provider = createMockProvider();
    await provider.upload("a/file1.txt", new Uint8Array([1]));
    await provider.upload("a/file2.txt", new Uint8Array([2]));
    await provider.upload("b/file3.txt", new Uint8Array([3]));

    const result = await provider.list("a/");
    expect(result.files).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

describe("FileStorageService.listChildren", () => {
  it("splits folders and files with absolute keys/prefixes", async () => {
    const provider: FileStorageProvider = {
      ...createMockProvider(),
      async listChildren(prefix) {
        expect(prefix).toBe("tenants/t1");
        return {
          folders: [{ name: "inbox" }, { name: "ai" }],
          files: [{ name: "logo.png", metadata: { size: 42 } }],
        };
      },
    };
    const service = createFileStorageService({ provider });
    if (!service.listChildren) {
      throw new Error("expected service.listChildren");
    }
    const result = await service.listChildren("tenants/t1");

    expect(result.folders).toEqual([
      { name: "inbox", prefix: "tenants/t1/inbox/" },
      { name: "ai", prefix: "tenants/t1/ai/" },
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.key).toBe("tenants/t1/logo.png");
    expect(result.files[0]?.size_bytes).toBe(42);
  });

  it("falls back to a flat listing when the provider lacks listChildren", async () => {
    const provider = createMockProvider();
    await provider.upload("t1/a.txt", new Uint8Array([1]));
    const service = createFileStorageService({ provider });
    if (!service.listChildren) {
      throw new Error("expected service.listChildren");
    }

    const result = await service.listChildren("t1");
    expect(result.folders).toEqual([]);
    expect(result.files.map((f) => f.key)).toContain("t1/a.txt");
  });

  it("copy duplicates a file", async () => {
    const provider = createMockProvider();
    const data = new Uint8Array([10, 20, 30]);
    await provider.upload("src.bin", data);
    await provider.copy("src.bin", "dest.bin");
    expect(await provider.download("dest.bin")).toEqual(data);
  });

  it("getUrl returns signed URL when requested", async () => {
    const provider = createMockProvider();
    const url = await provider.getUrl("test.pdf", {
      signed: true,
      expiresIn: 600,
    });
    expect(url).toContain("signed");
    expect(url).toContain("600");
  });

  it("getUrl returns public URL by default", async () => {
    const provider = createMockProvider();
    const url = await provider.getUrl("test.pdf");
    expect(url).toContain("public");
  });
});

describe("FileStorageService", () => {
  it("creates service from provider", () => {
    const provider = createMockProvider();
    const service = createFileStorageService({ provider });
    expect(typeof service.upload).toBe("function");
    expect(typeof service.download).toBe("function");
    expect(typeof service.list).toBe("function");
  });

  it("upload returns FileStorageFile with metadata", async () => {
    const provider = createMockProvider();
    const service = createFileStorageService({ provider });
    const data = new Uint8Array([1, 2, 3]);
    const file = await service.upload("test/receipt.pdf", data, {
      module: "expenses",
      contentType: "application/pdf",
    });

    expect(file.key).toBe("test/receipt.pdf");
    expect(file.filename).toBe("receipt.pdf");
    expect(file.mime_type).toBe("application/pdf");
    expect(file.size_bytes).toBe(3);
    expect(file.module).toBe("expenses");
    expect(file.created_at).toBeDefined();
  });

  it("applies path prefix", async () => {
    const provider = createMockProvider();
    const service = createFileStorageService({
      provider,
      pathPrefix: "tenants/abc",
    });

    await service.upload("expenses/receipt.pdf", new Uint8Array([1]));

    expect(provider._files.has("tenants/abc/expenses/receipt.pdf")).toBe(true);
  });

  it("getUrl defaults to signed", async () => {
    const provider = createMockProvider();
    const service = createFileStorageService({ provider });

    const url = await service.getUrl("test.pdf");
    expect(url).toContain("signed");
  });

  it("detects MIME type from filename", async () => {
    const provider = createMockProvider();
    const service = createFileStorageService({ provider });

    const pdfFile = await service.upload("invoice.pdf", new Uint8Array([1]));
    expect(pdfFile.mime_type).toBe("application/pdf");

    const imgFile = await service.upload("photo.jpg", new Uint8Array([2]));
    expect(imgFile.mime_type).toBe("image/jpeg");

    const unknownFile = await service.upload("data.xyz", new Uint8Array([3]));
    expect(unknownFile.mime_type).toBe("application/octet-stream");
  });

  it("delete removes file", async () => {
    const provider = createMockProvider();
    const service = createFileStorageService({ provider });

    await service.upload("to-delete.txt", new Uint8Array([1]));
    expect(await service.exists("to-delete.txt")).toBe(true);

    await service.delete("to-delete.txt");
    expect(await service.exists("to-delete.txt")).toBe(false);
  });

  it("copy creates a new file", async () => {
    const provider = createMockProvider();
    const service = createFileStorageService({ provider });

    await service.upload("original.pdf", new Uint8Array([1, 2, 3]));
    const copied = await service.copy("original.pdf", "copy.pdf");

    expect(copied.key).toBe("copy.pdf");
    expect(copied.filename).toBe("copy.pdf");
    expect(await service.exists("copy.pdf")).toBe(true);
  });

  it("getFile returns null for nonexistent", async () => {
    const provider = createMockProvider();
    const service = createFileStorageService({ provider });
    expect(await service.getFile("nope.txt")).toBeNull();
  });

  it("getFile returns FileStorageFile for existing", async () => {
    const provider = createMockProvider();
    const service = createFileStorageService({ provider });
    await service.upload("exists.pdf", new Uint8Array([1]));
    const file = await service.getFile("exists.pdf");
    expect(file).not.toBeNull();
    expect(file?.filename).toBe("exists.pdf");
  });

  it("list maps metadata.size to size_bytes", async () => {
    const provider = createMockProvider();
    const service = createFileStorageService({ provider });
    const origList = provider.list.bind(provider);
    provider.list = async (prefix, opts) => {
      const r = await origList(prefix, opts);
      return {
        ...r,
        files: r.files.map((f) => ({
          ...f,
          metadata: { size: 42_000 },
        })),
      };
    };
    await service.upload("a/x.png", new Uint8Array([1, 2, 3]));
    const { files } = await service.list("", { limit: 10 });
    const listed = files.find((f) => f.key.endsWith("x.png"));
    expect(listed?.size_bytes).toBe(42_000);
  });
});
