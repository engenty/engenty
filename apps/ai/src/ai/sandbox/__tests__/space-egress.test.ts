import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEgressProxy } from "../../../../../../deploy/egress-proxy/proxy.mjs";
import { publishSpaceEgress, resolveEgressSpacesDir } from "../space-egress.js";

// A Space computer reaches the shared registries plus its own Space's hosts,
// and nothing else. Ways this can fail: one Space's key opens another Space's
// hosts; a request with no key, or a wrong one, gets a Space's hosts; a
// `*.acme.com` entry lets `acme.com` or `evilacme.com` through; a settings
// change does not reach a proxy that is already running.

const T = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";

describe("per-Space egress through the proxy", () => {
  let root: string;
  let proxy: ReturnType<typeof createEgressProxy>;
  let upstream: net.Server;
  let port: number;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), "engenty-egress-"));
    vi.stubEnv("ENGENTY_SPACES_DIR", root);
    const filter = path.join(root, "filter");
    writeFileSync(filter, "# registries\n^(.+\\.)?pypi\\.org$\n");
    // Every allowed tunnel lands here, whatever host it named.
    upstream = net.createServer((socket) => socket.end("upstream\n"));
    await new Promise<void>((resolve) => upstream.listen(0, resolve));
    const upstreamPort = (upstream.address() as net.AddressInfo).port;
    proxy = createEgressProxy({
      connect: () => net.connect(upstreamPort, "127.0.0.1"),
      filterPath: filter,
      log: () => undefined,
      spacesDir: resolveEgressSpacesDir(),
    });
    await new Promise<void>((resolve) => proxy.listen(0, resolve));
    port = (proxy.address() as net.AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise((resolve) => proxy.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
    rmSync(root, { force: true, recursive: true });
    vi.unstubAllEnvs();
  });

  /** The proxy's status line for a CONNECT to `host`, as `credentials`. */
  function tunnel(
    host: string,
    credentials?: { password: string; username: string }
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, "127.0.0.1", () => {
        const auth = credentials
          ? `Proxy-Authorization: Basic ${Buffer.from(
              `${credentials.username}:${credentials.password}`
            ).toString("base64")}\r\n`
          : "";
        socket.write(
          `CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n${auth}\r\n`
        );
      });
      socket.once("data", (chunk) => {
        resolve(Number(chunk.toString().split(" ")[1]));
        socket.destroy();
      });
      socket.on("error", reject);
    });
  }

  it("adds a Space's own hosts for that Space's computer only", async () => {
    const a = publishSpaceEgress({
      hosts: ["api.acme.com", "*.tools.dev"],
      spaceId: A,
      tenantId: T,
    });
    const b = publishSpaceEgress({ hosts: [], spaceId: B, tenantId: T });

    expect(await tunnel("files.pypi.org", a)).toBe(200);
    expect(await tunnel("files.pypi.org")).toBe(200);
    expect(await tunnel("api.acme.com", a)).toBe(200);
    expect(await tunnel("cdn.tools.dev", a)).toBe(200);

    expect(await tunnel("api.acme.com", b)).toBe(403);
    expect(await tunnel("api.acme.com")).toBe(403);
    expect(await tunnel("api.acme.com", { ...b, username: A })).toBe(407);
    expect(await tunnel("tools.dev", a)).toBe(403);
    expect(await tunnel("eviltools.dev", a)).toBe(403);
    expect(await tunnel("example.com", a)).toBe(403);
  });

  it("applies a changed list to the next request, with the same key", async () => {
    const first = publishSpaceEgress({ hosts: [], spaceId: A, tenantId: T });
    expect(await tunnel("api.acme.com", first)).toBe(403);

    const second = publishSpaceEgress({
      hosts: ["api.acme.com"],
      spaceId: A,
      tenantId: T,
    });
    expect(second).toEqual(first);
    expect(await tunnel("api.acme.com", first)).toBe(200);
  });
});
