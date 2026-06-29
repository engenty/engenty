import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import { envBoolean, envString } from "@engenty/environment/env";
import { shouldRegisterDevGateway } from "./dev-gateway.js";
import { type GatewayTarget, resolveGatewayTarget } from "./gateway-paths.js";
import { tryServeStatic } from "./prod-gateway-static.js";
import { createReverseProxy } from "./reverse-proxy.js";

const DEFAULT_AI_URL = "http://127.0.0.1:8790";
const DEFAULT_DOCS_URL = "http://127.0.0.1:3000";
const DEFAULT_STUDIO_URL = "http://127.0.0.1:43111";

export interface ProdGatewayConfig {
  aiUrl: string;
  docsEnabled: boolean;
  docsUrl: string;
  manageEnabled: boolean;
  manageRoot: string;
  studioBasicAuth: { password: string; user: string } | null;
  studioEnabled: boolean;
  studioUrl: string;
  uiRoot: string;
}

export function shouldRegisterProdGateway(): boolean {
  if (shouldRegisterDevGateway()) {
    return false;
  }
  return process.env.ENGENTY_PROD_GATEWAY === "1";
}

function readTargetUrl(
  envKey: string,
  fallback: string,
  label: string
): string {
  const raw = process.env[envKey]?.trim();
  if (!raw) {
    return fallback;
  }
  try {
    return new URL(raw).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid ${envKey} for prod gateway (${label}): ${raw}`);
  }
}

function parseStudioBasicAuth(): ProdGatewayConfig["studioBasicAuth"] {
  const raw = process.env.ENGENTY_GATEWAY_STUDIO_BASIC_AUTH?.trim();
  if (!raw) {
    return null;
  }
  const colon = raw.indexOf(":");
  if (colon <= 0) {
    throw new Error(
      "ENGENTY_GATEWAY_STUDIO_BASIC_AUTH must be user:password (colon required)"
    );
  }
  return {
    user: raw.slice(0, colon),
    password: raw.slice(colon + 1),
  };
}

export function readProdGatewayConfig(): ProdGatewayConfig {
  return {
    aiUrl: readTargetUrl("ENGENTY_GATEWAY_AI_URL", DEFAULT_AI_URL, "AI"),
    docsEnabled: envBoolean(
      {},
      "docsEnabled",
      "ENGENTY_GATEWAY_DOCS_ENABLED",
      false
    ),
    docsUrl: readTargetUrl(
      "ENGENTY_GATEWAY_DOCS_URL",
      DEFAULT_DOCS_URL,
      "Docs"
    ),
    manageEnabled: envBoolean(
      {},
      "manageEnabled",
      "ENGENTY_GATEWAY_MANAGE_ENABLED",
      true
    ),
    manageRoot: envString(
      {},
      "manageRoot",
      "ENGENTY_GATEWAY_MANAGE_ROOT",
      "/app/manage"
    ),
    studioBasicAuth: parseStudioBasicAuth(),
    studioEnabled: envBoolean(
      {},
      "studioEnabled",
      "ENGENTY_GATEWAY_STUDIO_ENABLED",
      false
    ),
    studioUrl: readTargetUrl(
      "ENGENTY_GATEWAY_STUDIO_URL",
      DEFAULT_STUDIO_URL,
      "Studio"
    ),
    uiRoot: envString({}, "uiRoot", "ENGENTY_GATEWAY_UI_ROOT", "/app/ui"),
  };
}

function writeGatewayDisabled(res: ServerResponse, feature: string): void {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end(`${feature} is not enabled on this deployment`);
}

function checkStudioBasicAuth(
  req: IncomingMessage,
  res: ServerResponse,
  auth: NonNullable<ProdGatewayConfig["studioBasicAuth"]>
): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    res.writeHead(401, {
      "content-type": "text/plain; charset=utf-8",
      "www-authenticate": 'Basic realm="Engenty Studio"',
    });
    res.end("Authentication required");
    return false;
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  const user = colon >= 0 ? decoded.slice(0, colon) : decoded;
  const password = colon >= 0 ? decoded.slice(colon + 1) : "";
  if (user !== auth.user || password !== auth.password) {
    res.writeHead(401, {
      "content-type": "text/plain; charset=utf-8",
      "www-authenticate": 'Basic realm="Engenty Studio"',
    });
    res.end("Invalid credentials");
    return false;
  }
  return true;
}

function isTargetEnabled(
  target: GatewayTarget,
  config: ProdGatewayConfig
): boolean {
  switch (target) {
    case "studio":
      return config.studioEnabled;
    case "manage":
      return config.manageEnabled;
    case "docs":
      return config.docsEnabled;
    default:
      return true;
  }
}

export interface ProdGatewayHooks {
  logEnabled: () => void;
  maybeHandleRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    honoListener: (req: IncomingMessage, res: ServerResponse) => void
  ) => void;
  maybeHandleUpgrade: (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) => void;
}

export function createProdGatewayHooks(
  config: ProdGatewayConfig,
  logger?: {
    info: (message: string, meta?: Record<string, unknown>) => void;
  }
): ProdGatewayHooks {
  const proxies = {
    ai: createReverseProxy({
      target: config.aiUrl,
      ws: true,
      changeOrigin: true,
    }),
    docs: createReverseProxy({
      target: config.docsUrl,
      ws: true,
      changeOrigin: false,
    }),
    studio: createReverseProxy({
      target: config.studioUrl,
      ws: true,
      changeOrigin: true,
    }),
  };

  for (const proxy of [proxies.docs]) {
    proxy.on("proxyReq", (proxyReq, req) => {
      const host = req.headers.host;
      if (host) {
        proxyReq.setHeader("x-forwarded-host", host);
      }
      proxyReq.setHeader("x-forwarded-proto", "https");
    });
  }

  for (const proxy of Object.values(proxies)) {
    proxy.on("error", (error, req, res) => {
      const message = error instanceof Error ? error.message : String(error);
      if (res && "writeHead" in res && !res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end(`Prod gateway proxy error: ${message}`);
        return;
      }
      if (req.socket && !req.socket.destroyed) {
        req.socket.destroy();
      }
    });
  }

  let logged = false;

  return {
    logEnabled: () => {
      if (logged) {
        return;
      }
      logged = true;
      logger?.info("Prod gateway enabled", {
        aiUrl: config.aiUrl,
        docsEnabled: config.docsEnabled,
        docsUrl: config.docsUrl,
        manageEnabled: config.manageEnabled,
        manageRoot: config.manageRoot,
        studioEnabled: config.studioEnabled,
        studioUrl: config.studioUrl,
        uiRoot: config.uiRoot,
      });
    },
    maybeHandleRequest(req, res, honoListener) {
      const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      const target = resolveGatewayTarget(pathname);
      if (target === null) {
        honoListener(req, res);
        return;
      }
      if (!isTargetEnabled(target, config)) {
        writeGatewayDisabled(
          res,
          target === "studio"
            ? "Studio"
            : target === "manage"
              ? "Manage"
              : "Docs"
        );
        return;
      }
      if (
        target === "studio" &&
        config.studioBasicAuth &&
        !checkStudioBasicAuth(req, res, config.studioBasicAuth)
      ) {
        return;
      }
      if (target === "ui") {
        tryServeStatic(req, res, {
          rootDir: config.uiRoot,
          urlPrefix: "/",
        });
        return;
      }
      if (target === "manage") {
        tryServeStatic(req, res, {
          rootDir: config.manageRoot,
          urlPrefix: "/manage",
        });
        return;
      }
      if (target === "ai") {
        proxies.ai.web(req, res);
        return;
      }
      if (target === "studio") {
        proxies.studio.web(req, res);
        return;
      }
      proxies.docs.web(req, res);
    },
    maybeHandleUpgrade(req, socket, head) {
      const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      const netSocket = socket as Socket;
      const target = resolveGatewayTarget(pathname);
      if (target === null) {
        socket.destroy();
        return;
      }
      if (!isTargetEnabled(target, config)) {
        socket.destroy();
        return;
      }
      if (target === "ai") {
        proxies.ai.ws(req, netSocket, head);
        return;
      }
      if (target === "studio") {
        proxies.studio.ws(req, netSocket, head);
        return;
      }
      if (target === "docs") {
        proxies.docs.ws(req, netSocket, head);
        return;
      }
      socket.destroy();
    },
  };
}
