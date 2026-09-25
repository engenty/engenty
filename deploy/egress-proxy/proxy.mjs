#!/usr/bin/env node
// The egress proxy: every host an `egress` sandbox reaches goes through here.
//
// Default deny. A host is allowed when it matches the shared allowlist
// (`filter`: one POSIX-style regex per line, the package registries) or, for a
// Space computer, one of that Space's own hosts. A Space computer names its
// Space in the proxy URL (`http://<spaceId>:<key>@…`); apps/ai writes
// `<spacesDir>/<spaceId>.json` = { key_sha256, hosts } on every run, so a
// change in the Space's settings applies to the next request. Without
// credentials only the shared list applies; wrong credentials are refused.
//
// No dependencies: it runs in a stock node image with this file mounted.

import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const CONNECT_PORTS = new Set([443, 563]);
const BASIC_AUTH = /^basic\s+(.+)$/i;
const IPV6_BRACKETS = /^\[|\]$/g;
const TRAILING_DOT = /\.$/;
const HOST_PORT = /:(?=\d+$)/;
const SPACE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readFilter(filterPath) {
  return readFileSync(filterPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => new RegExp(line, "i"));
}

/** `*.example.com` matches every subdomain, not `example.com` itself. */
function hostMatches(entry, host) {
  if (entry.startsWith("*.")) {
    const suffix = entry.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === entry;
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

/**
 * The Space a request names, or `null` for none and `false` for credentials
 * that do not check out.
 */
function spaceOf(header, spacesDir, cache) {
  if (!header) {
    return null;
  }
  const match = BASIC_AUTH.exec(header.trim());
  if (!match) {
    return false;
  }
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  const spaceId = decoded.slice(0, colon);
  const key = decoded.slice(colon + 1);
  if (colon < 1 || !SPACE_ID.test(spaceId) || !key) {
    return false;
  }
  const file = path.join(spacesDir, `${spaceId.toLowerCase()}.json`);
  let entry;
  try {
    // apps/ai renames a new file into place, so a new list is a new inode.
    const { ino, mtimeNs } = statSync(file, { bigint: true });
    const version = `${ino}:${mtimeNs}`;
    entry = cache.get(file);
    if (!entry || entry.version !== version) {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      entry = {
        hosts: Array.isArray(parsed.hosts) ? parsed.hosts.map(String) : [],
        keySha256: Buffer.from(String(parsed.key_sha256 ?? ""), "hex"),
        version,
      };
      cache.set(file, entry);
    }
  } catch {
    return false;
  }
  const given = sha256(key);
  if (
    entry.keySha256.length !== given.length ||
    !timingSafeEqual(entry.keySha256, given)
  ) {
    return false;
  }
  return { hosts: entry.hosts, spaceId };
}

function normalizeHost(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(IPV6_BRACKETS, "")
    .replace(TRAILING_DOT, "");
}

export function createEgressProxy({
  connect = (port, host) => net.connect(port, host),
  filterPath,
  log = (line) => process.stdout.write(`${line}\n`),
  spacesDir,
}) {
  const filter = readFilter(filterPath);
  const cache = new Map();

  function decide(req, host) {
    const space = spaceOf(req.headers["proxy-authorization"], spacesDir, cache);
    if (space === false) {
      return { allowed: false, reason: "bad_credentials", status: 407 };
    }
    if (filter.some((pattern) => pattern.test(host))) {
      return { allowed: true, reason: "shared", space };
    }
    if (space?.hosts.some((entry) => hostMatches(entry, host))) {
      return { allowed: true, reason: "space", space };
    }
    return { allowed: false, reason: "not_listed", space, status: 403 };
  }

  function record(decision, method, host) {
    log(
      JSON.stringify({
        allowed: decision.allowed,
        host,
        method,
        reason: decision.reason,
        space_id: decision.space ? decision.space.spaceId : null,
      })
    );
  }

  const server = http.createServer((req, res) => {
    let target;
    try {
      target = new URL(req.url ?? "");
    } catch {
      res.writeHead(400).end("absolute URL required\n");
      return;
    }
    if (target.protocol !== "http:") {
      res
        .writeHead(400)
        .end("only http:// is proxied; use CONNECT for https\n");
      return;
    }
    const host = normalizeHost(target.hostname);
    const decision = decide(req, host);
    record(decision, req.method, host);
    if (!decision.allowed) {
      res
        .writeHead(decision.status, {
          ...(decision.status === 407
            ? { "proxy-authenticate": 'Basic realm="engenty"' }
            : {}),
        })
        .end(`egress refused: ${host} (${decision.reason})\n`);
      return;
    }
    const {
      "proxy-authorization": _credentials,
      "proxy-connection": _connection,
      ...headers
    } = req.headers;
    const upstream = http.request(
      {
        headers,
        host,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        port: target.port || 80,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );
    upstream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end();
    });
    req.pipe(upstream);
  });

  server.on("connect", (req, clientSocket, head) => {
    const [rawHost, rawPort] = String(req.url ?? "").split(HOST_PORT);
    const host = normalizeHost(rawHost);
    const port = Number(rawPort);
    const decision = CONNECT_PORTS.has(port)
      ? decide(req, host)
      : { allowed: false, reason: "port", status: 403 };
    record(decision, "CONNECT", host);
    if (!decision.allowed) {
      clientSocket.end(
        `HTTP/1.1 ${decision.status} Egress Refused\r\n${
          decision.status === 407
            ? 'Proxy-Authenticate: Basic realm="engenty"\r\n'
            : ""
        }Content-Length: 0\r\n\r\n`
      );
      return;
    }
    const upstream = connect(port, host);
    upstream.on("connect", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) {
        upstream.write(head);
      }
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    const close = () => {
      upstream.destroy();
      clientSocket.destroy();
    };
    upstream.on("error", () => {
      if (clientSocket.writable) {
        clientSocket.end(
          "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n"
        );
      }
      close();
    });
    clientSocket.on("error", close);
  });

  return server;
}

const isMain =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const server = createEgressProxy({
    filterPath: process.env.EGRESS_FILTER ?? "/etc/engenty-egress/filter",
    spacesDir: process.env.EGRESS_SPACES_DIR ?? "/etc/engenty-egress/spaces",
  });
  server.listen(Number(process.env.PORT ?? 8888), "0.0.0.0");
}
