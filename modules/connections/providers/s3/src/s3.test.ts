import type { ConnectorActionContext } from "@engenty/connections-sdk";
import { describe, expect, it, vi } from "vitest";
import { parseListResponse, s3Connector, verifyS3Credentials } from "./s3.js";

const CREDS = {
  access_key_id: "AKIA_TEST",
  bucket: "my-bucket",
  prefix: "root",
  region: "eu-central-1",
  secret_access_key: "secret",
};

function ctxWith(
  fetchImpl: typeof fetch,
  credentials: Record<string, unknown> = CREDS
): ConnectorActionContext {
  return {
    accessToken: JSON.stringify(credentials),
    connection: { external_account: "my-bucket/root" },
    fetchImpl,
    log: () => undefined,
  } as unknown as ConnectorActionContext;
}

const LIST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>token-1</NextContinuationToken>
  <Contents>
    <Key>root/report.pdf</Key>
    <LastModified>2026-07-01T10:00:00.000Z</LastModified>
    <Size>1234</Size>
  </Contents>
  <Contents>
    <Key>root/sub/</Key>
    <Size>0</Size>
  </Contents>
  <CommonPrefixes><Prefix>root/sub/</Prefix></CommonPrefixes>
</ListBucketResult>`;

describe("parseListResponse", () => {
  it("maps CommonPrefixes to folders and Contents to files, relative to root", () => {
    const result = parseListResponse(LIST_XML, "root/");
    expect(result.next_cursor).toBe("token-1");
    expect(result.entries).toEqual([
      {
        kind: "folder",
        mime_type: null,
        modified_at: null,
        name: "sub",
        ref: "sub/",
        size: null,
      },
      {
        kind: "file",
        mime_type: null,
        modified_at: "2026-07-01T10:00:00.000Z",
        name: "report.pdf",
        ref: "report.pdf",
        size: 1234,
      },
    ]);
  });

  it("handles single-element responses (parser returns objects, not arrays)", () => {
    const single =
      "<ListBucketResult><Contents><Key>root/a.txt</Key><Size>1</Size></Contents></ListBucketResult>";
    const result = parseListResponse(single, "root/");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.ref).toBe("a.txt");
  });
});

describe("s3 files capability", () => {
  it("lists with a SigV4-signed delimiter query", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL) =>
        new Response(LIST_XML, { status: 200 })
    ) as unknown as typeof fetch;
    const result = await s3Connector.files?.list(ctxWith(fetchImpl), {
      folder_ref: null,
      limit: 50,
    });
    expect(result?.entries.map((e) => e.ref)).toEqual(["sub/", "report.pdf"]);
    const req = (fetchImpl as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Request;
    expect(req.url).toContain("list-type=2");
    expect(req.url).toContain("delimiter=%2F");
    expect(req.url).toContain("prefix=root%2F");
    expect(req.url).toContain("max-keys=50");
    expect(req.headers.get("authorization")).toMatch(/AWS4-HMAC-SHA256/);
    expect(req.headers.get("authorization")).toContain("AKIA_TEST");
  });

  it("read presigns a GET URL after a HEAD for metadata", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          headers: {
            "content-length": "42",
            "content-type": "text/plain",
          },
          status: 200,
        })
    ) as unknown as typeof fetch;
    const result = await s3Connector.files?.read(ctxWith(fetchImpl), {
      file_ref: "sub/a.txt",
    });
    if (result?.kind !== "url") {
      throw new Error("expected a url result");
    }
    expect(result.size).toBe(42);
    expect(result.mime_type).toBe("text/plain");
    expect(result.url).toContain("X-Amz-Signature=");
    expect(result.url).toContain("/my-bucket/root/sub/a.txt");
    // Only the HEAD hit the network; the GET is presigned for the caller.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("verify surfaces provider errors", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("<Error>AccessDenied</Error>", { status: 403 })
    ) as unknown as typeof fetch;
    await expect(
      verifyS3Credentials(CREDS as never, fetchImpl)
    ).rejects.toThrow(/s3_verify_failed \(403\)/);
  });

  it("verify resolves bucket/prefix as the account label", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(LIST_XML, { status: 200 })
    ) as unknown as typeof fetch;
    await expect(
      verifyS3Credentials(CREDS as never, fetchImpl)
    ).resolves.toEqual({
      externalId: "my-bucket/root",
      label: "my-bucket/root",
    });
  });

  it("synthesizes the s3_files_* agent actions", () => {
    expect(s3Connector.actions.map((a) => a.id)).toEqual([
      "files_list",
      "files_read",
      "files_stat",
      "files_search",
    ]);
  });
});
