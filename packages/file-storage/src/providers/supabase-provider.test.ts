import { beforeEach, describe, expect, it, vi } from "vitest";

const filesMock = {
  copy: vi.fn(),
  delete: vi.fn(),
  download: vi.fn(),
  exists: vi.fn(),
  list: vi.fn(),
  signedUploadUrl: vi.fn(),
  upload: vi.fn(),
  url: vi.fn(),
  adapter: {
    raw: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn(() => ({
          data: { publicUrl: "https://public/x" },
        })),
        list: vi.fn(),
      })),
    },
  },
};

vi.mock("files-sdk", () => ({
  Files: vi.fn(function Files() {
    return filesMock;
  }),
  FilesError: class FilesError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("files-sdk/supabase", () => ({
  supabase: vi.fn(() => ({ name: "supabase" })),
}));

import { FilesError } from "files-sdk";
import { createSupabaseFileStorageProvider } from "./supabase-provider.js";

describe("createSupabaseFileStorageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps NotFound download errors to null", async () => {
    filesMock.download.mockRejectedValue(new FilesError("NotFound", "missing"));
    const provider = createSupabaseFileStorageProvider({
      bucket: "files",
      client: {},
    });
    await expect(provider.download("missing.txt")).resolves.toBeNull();
  });

  it("uses files.exists instead of downloading", async () => {
    filesMock.exists.mockResolvedValue(true);
    const provider = createSupabaseFileStorageProvider({
      bucket: "files",
      client: {},
    });
    await expect(provider.exists("a.txt")).resolves.toBe(true);
    expect(filesMock.exists).toHaveBeenCalledWith("a.txt");
  });

  it("maps NotFound exists errors to false", async () => {
    filesMock.exists.mockRejectedValue(
      new FilesError("NotFound", "Object not found")
    );
    const provider = createSupabaseFileStorageProvider({
      bucket: "files",
      client: {},
    });
    await expect(provider.exists("missing.txt")).resolves.toBe(false);
  });

  it("maps list offset to files-sdk cursor", async () => {
    filesMock.list.mockResolvedValue({
      items: [
        {
          key: "a/file1.txt",
          lastModified: Date.now(),
          metadata: {},
        },
      ],
    });
    const provider = createSupabaseFileStorageProvider({
      bucket: "files",
      client: {},
    });
    await provider.list("a/", { limit: 10, offset: 20 });
    expect(filesMock.list).toHaveBeenCalledWith({
      prefix: "a/",
      limit: 10,
      cursor: "20",
    });
  });

  it("passes signed upload URLs through", async () => {
    filesMock.signedUploadUrl.mockResolvedValue({
      method: "PUT",
      url: "https://signed/upload",
      headers: { "x-upsert": "true" },
    });
    const provider = createSupabaseFileStorageProvider({
      bucket: "files",
      client: {},
    });
    await expect(
      provider.signedUploadUrl?.("tenants/a/expenses/x.pdf", {
        contentType: "application/pdf",
      })
    ).resolves.toEqual({
      key: "tenants/a/expenses/x.pdf",
      url: "https://signed/upload",
      headers: { "x-upsert": "true" },
    });
  });
});
