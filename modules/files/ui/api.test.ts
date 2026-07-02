/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildVaultUploadKey,
  FILES_UPLOAD_MAX_BYTES,
  uploadFileViaSignedUrl,
} from "./api.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

function asFile(name: string, size: number, type = ""): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("buildVaultUploadKey", () => {
  it("places uploads under the tenant root when no prefix is given", () => {
    const key = buildVaultUploadKey({
      filename: "Hello World.pdf",
      tenantId: TENANT_ID,
      timestamp: 1_700_000_000_000,
    });
    expect(key).toBe(`tenants/${TENANT_ID}/1700000000000_Hello_World.pdf`);
  });

  it("appends to a relative prefix under the tenant root", () => {
    const key = buildVaultUploadKey({
      filename: "report.docx",
      prefix: "expenses",
      tenantId: TENANT_ID,
      timestamp: 1_700_000_000_000,
    });
    expect(key).toBe(`tenants/${TENANT_ID}/expenses/1700000000000_report.docx`);
  });

  it("preserves a deep tenant-scoped prefix", () => {
    const key = buildVaultUploadKey({
      filename: "x.txt",
      prefix: `tenants/${TENANT_ID}/knowledge-base/my-kb`,
      tenantId: TENANT_ID,
      timestamp: 1_700_000_000_000,
    });
    expect(key).toBe(
      `tenants/${TENANT_ID}/knowledge-base/my-kb/1700000000000_x.txt`
    );
  });

  it("rejects prefixes pointing at a different tenant", () => {
    expect(() =>
      buildVaultUploadKey({
        filename: "x.txt",
        prefix: "tenants/22222222-2222-2222-2222-222222222222/foo",
        tenantId: TENANT_ID,
      })
    ).toThrow("upload_prefix_outside_tenant");
  });
});

describe("uploadFileViaSignedUrl", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests a signed URL then PUTs the bytes with the resolved content type", async () => {
    const expectedKey = `tenants/${TENANT_ID}/1700000000000_doc.pdf`;

    fetchMock.mockImplementationOnce(async (input, init) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      expect(url).toContain("/api/file-storage/files/signed-upload-url");
      expect(url).toContain("bucket=files");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body).toMatchObject({
        key: expectedKey,
        content_type: "application/pdf",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            bucket: "files",
            headers: { "x-extra": "1" },
            key: expectedKey,
            url: "https://upload.example/signed",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    fetchMock.mockImplementationOnce(async (input, init) => {
      expect(input).toBe("https://upload.example/signed");
      expect(init?.method).toBe("PUT");
      const headers = new Headers(init?.headers ?? {});
      expect(headers.get("x-extra")).toBe("1");
      expect(headers.get("Content-Type")).toBe("application/pdf");
      return new Response(null, { status: 200 });
    });

    const file = asFile("doc.pdf", 16, "application/octet-stream");
    const result = await uploadFileViaSignedUrl(file, {
      bucket: "files",
      tenantId: TENANT_ID,
    });

    expect(result.key).toBe(expectedKey);
    expect(result.mime_type).toBe("application/pdf");
    expect(result.size_bytes).toBe(16);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses files larger than the configured maximum", async () => {
    const file = asFile("big.bin", FILES_UPLOAD_MAX_BYTES + 1);
    await expect(
      uploadFileViaSignedUrl(file, { tenantId: TENANT_ID })
    ).rejects.toThrow("upload_too_large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses uploads without a tenant id", async () => {
    const file = asFile("x.txt", 1, "text/plain");
    await expect(
      uploadFileViaSignedUrl(file, { tenantId: "" })
    ).rejects.toThrow("upload_tenant_required");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
