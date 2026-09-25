/**
 * Server-side reads of connector files must not `fetch` a relative
 * `/download` path. Local-files and Drive return text/base64 from
 * `filesRead`; Node `fetch` of that path is `Invalid URL`.
 */
import {
  type FileSourceContext,
  FileSourceNotFoundError,
} from "@engenty/file-storage";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bytesFromConnectorRead,
  createConnectorFileSource,
} from "./connector-file-source.js";
import { encodeConnectorNodeId } from "./connector-ref.js";

/** The file space may use every connection in these tests. */
const allowConnection = async () => undefined;

const ctx: FileSourceContext = {
  owner: { id: "space-1", type: "space" },
  principalId: "user-1",
  tenantId: "tenant-1",
};

const CONNECTION_ID = "9b2f1c44-0000-4000-8000-000000000001";
const fileId = encodeConnectorNodeId(CONNECTION_ID, "index.md");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bytesFromConnectorRead", () => {
  it("decodes text without fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const bytes = await bytesFromConnectorRead({
      content: "# index",
      kind: "text",
      mime_type: "text/markdown",
      name: "index.md",
      size: 7,
      truncated: false,
    });
    expect(new TextDecoder().decode(bytes)).toBe("# index");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("decodes base64 without fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const bytes = await bytesFromConnectorRead({
      content_base64: Buffer.from("hello").toString("base64"),
      kind: "base64",
      mime_type: "application/octet-stream",
      name: "blob.bin",
      size: 5,
      truncated: false,
    });
    expect(Buffer.from(bytes).toString("utf8")).toBe("hello");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches an absolute provider URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })
      )
    );
    const bytes = await bytesFromConnectorRead({
      expires_at: null,
      kind: "url",
      mime_type: "application/pdf",
      name: "q2.pdf",
      size: 3,
      url: "https://signed.example/q2.pdf",
    });
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledWith("https://signed.example/q2.pdf");
  });

  it("does not treat a relative download path as a fetchable URL", async () => {
    await expect(
      bytesFromConnectorRead({
        expires_at: null,
        kind: "url",
        mime_type: "text/markdown",
        name: "index.md",
        size: 7,
        url: `/api/files/spaces/space/space-1/files/${encodeURIComponent(fileId)}/download`,
      })
    ).rejects.toThrow("File not found");
  });
});

describe("connector file source readBytes", () => {
  it("returns proxied text bytes instead of a relative download URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const source = createConnectorFileSource({
      assertConnectionUsable: allowConnection,
      client: {
        filesList: vi.fn(),
        filesRead: vi.fn(async () => ({
          content: "# index",
          kind: "text" as const,
          mime_type: "text/markdown",
          name: "index.md",
          size: 7,
          truncated: false,
        })),
      },
      getMount: vi.fn(async () => null),
    });
    const bytes = await source.readBytes(ctx, fileId);
    expect(new TextDecoder().decode(bytes)).toBe("# index");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still exposes a relative download path for the browser URL route", async () => {
    const filesRead = vi.fn();
    const source = createConnectorFileSource({
      assertConnectionUsable: allowConnection,
      client: {
        filesList: vi.fn(),
        filesRead,
      },
      getMount: vi.fn(async () => null),
    });
    await expect(source.getDownloadUrl(ctx, fileId)).resolves.toBe(
      `/api/files/spaces/space/space-1/files/${encodeURIComponent(fileId)}/download`
    );
    expect(filesRead).not.toHaveBeenCalled();
  });
});

describe("connector file source — the drive's Space", () => {
  it("refuses a drive this file space's Space does not own", async () => {
    const filesRead = vi.fn();
    const filesList = vi.fn();
    const source = createConnectorFileSource({
      assertConnectionUsable: async () => {
        throw new FileSourceNotFoundError(
          "That connected drive belongs to another Space"
        );
      },
      client: { filesList, filesRead },
      getMount: vi.fn(async () => null),
    });

    await expect(source.readBytes(ctx, fileId)).rejects.toThrow(
      "belongs to another Space"
    );
    await expect(source.listFolder(ctx, fileId)).rejects.toThrow(
      "belongs to another Space"
    );
    expect(filesRead).not.toHaveBeenCalled();
    expect(filesList).not.toHaveBeenCalled();
  });
});
