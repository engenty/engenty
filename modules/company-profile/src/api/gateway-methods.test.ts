import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCompanyProfileGatewayMethods } from "./gateway-methods.js";

interface CapturedOp {
  handler: (input: unknown, ctx: unknown) => Promise<unknown>;
  operationId: string;
  spacePolicy?: { kind: string };
}

function collectOperations() {
  const ops = new Map<string, CapturedOp>();
  const server = {
    registerOperation: (op: CapturedOp) => {
      ops.set(op.operationId, op);
    },
  };
  return { server, ops };
}

function makeRepo() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    merge: vi.fn(async (input: Record<string, unknown>) => ({
      name: "Engrd",
      ...input,
    })),
  };
}

const auth = { tenantId: "tenant-1" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("company_profile_set operation", () => {
  it("declares tenant_shared spacePolicy on every operation", () => {
    const { server, ops } = collectOperations();
    registerCompanyProfileGatewayMethods(server as never, makeRepo() as never);

    expect([...ops.values()].map((op) => op.spacePolicy)).toEqual([
      { kind: "tenant_shared" },
      { kind: "tenant_shared" },
      { kind: "tenant_shared" },
      { kind: "tenant_shared" },
    ]);
  });

  it("partial-merges the provided fields", async () => {
    const { server, ops } = collectOperations();
    const repo = makeRepo();
    registerCompanyProfileGatewayMethods(server as never, repo as never);

    const result = await ops
      .get("company_profile_set")!
      .handler({ name: "New Name" }, { auth });

    expect(repo.merge).toHaveBeenCalledWith({ name: "New Name" });
    expect(result).toMatchObject({ name: "New Name" });
  });
});

describe("company_profile_set_logo operation", () => {
  const storage = {
    upload: vi.fn(async () => undefined),
    getUrl: vi.fn(async () => "https://files.test/tenant-1/logo.png"),
  };

  beforeEach(() => {
    storage.upload.mockClear();
    storage.getUrl.mockClear();
  });

  it("clears the logo when image_url is null", async () => {
    const { server, ops } = collectOperations();
    const repo = makeRepo();
    registerCompanyProfileGatewayMethods(
      server as never,
      repo as never,
      storage as never
    );

    await ops
      .get("company_profile_set_logo")!
      .handler({ image_url: null }, { auth });

    expect(repo.merge).toHaveBeenCalledWith({ logo_url: null });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("downloads a public image and re-hosts it in storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "image/png" },
        blob: async () => new Blob([new Uint8Array([1, 2, 3])]),
      }))
    );
    const { server, ops } = collectOperations();
    const repo = makeRepo();
    registerCompanyProfileGatewayMethods(
      server as never,
      repo as never,
      storage as never
    );

    const result = await ops
      .get("company_profile_set_logo")!
      .handler({ image_url: "https://acme.example/logo.png" }, { auth });

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(repo.merge).toHaveBeenCalledWith({
      logo_url: "https://files.test/tenant-1/logo.png",
    });
    expect(result).toMatchObject({
      logo_url: "https://files.test/tenant-1/logo.png",
    });
  });

  it("rejects non-public (SSRF) URLs before fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { server, ops } = collectOperations();
    const repo = makeRepo();
    registerCompanyProfileGatewayMethods(
      server as never,
      repo as never,
      storage as never
    );

    await expect(
      ops
        .get("company_profile_set_logo")!
        .handler({ image_url: "http://localhost:8787/admin" }, { auth })
    ).rejects.toThrow(/Invalid logo URL/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(repo.merge).not.toHaveBeenCalled();
  });

  it("rejects unsupported image content types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        blob: async () => new Blob([]),
      }))
    );
    const { server, ops } = collectOperations();
    const repo = makeRepo();
    registerCompanyProfileGatewayMethods(
      server as never,
      repo as never,
      storage as never
    );

    await expect(
      ops
        .get("company_profile_set_logo")!
        .handler({ image_url: "https://acme.example/page.html" }, { auth })
    ).rejects.toThrow(/Unsupported image type/);
  });

  it("falls back to the source URL when no storage service is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "image/webp" },
        blob: async () => new Blob([]),
      }))
    );
    const { server, ops } = collectOperations();
    const repo = makeRepo();
    registerCompanyProfileGatewayMethods(server as never, repo as never);

    await ops
      .get("company_profile_set_logo")!
      .handler({ image_url: "https://acme.example/logo.webp" }, { auth });

    expect(repo.merge).toHaveBeenCalledWith({
      logo_url: "https://acme.example/logo.webp",
    });
  });
});
