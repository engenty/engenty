import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { resolveGatewayTarget } from "./gateway-paths.js";
import { createReverseProxy } from "./reverse-proxy.js";

const DEFAULT_UI_URL = "http://127.0.0.1:5173";
const DEFAULT_MANAGE_URL = "http://127.0.0.1:5174";
const DEFAULT_AI_URL = "http://127.0.0.1:8790";
const DEFAULT_STUDIO_URL = "http://127.0.0.1:43111";
const DEFAULT_DOCS_URL = "http://127.0.0.1:3002";

export type DevGatewayTarget = "ai" | "docs" | "manage" | "studio" | "ui";

export {
  isDocsGatewayPath,
  isManageGatewayPath,
  resolveGatewayTarget as resolveDevGatewayTarget,
} from "./gateway-paths.js";

export function shouldRegisterDevGateway(): boolean {
  if (!isEngentyDevelopmentEnvironment()) {
    return false;
  }
  return process.env.ENGENTY_DEV_GATEWAY === "1";
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
    throw new Error(`Invalid ${envKey} for dev gateway (${label}): ${raw}`);
  }
}

export interface DevGatewayHooks {
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

export function createDevGatewayHooks(logger?: {
  info: (message: string, meta?: Record<string, unknown>) => void;
}): DevGatewayHooks {
  const uiUrl = readTargetUrl(
    "ENGENTY_DEV_GATEWAY_UI_URL",
    DEFAULT_UI_URL,
    "UI"
  );
  const manageUrl = readTargetUrl(
    "ENGENTY_DEV_GATEWAY_MANAGE_URL",
    DEFAULT_MANAGE_URL,
    "Manage"
  );
  const aiUrl = readTargetUrl(
    "ENGENTY_DEV_GATEWAY_AI_URL",
    DEFAULT_AI_URL,
    "AI"
  );
  const studioUrl = readTargetUrl(
    "ENGENTY_DEV_GATEWAY_STUDIO_URL",
    DEFAULT_STUDIO_URL,
    "Studio"
  );
  const docsUrl = readTargetUrl(
    "ENGENTY_DEV_GATEWAY_DOCS_URL",
    DEFAULT_DOCS_URL,
    "Docs"
  );

  const proxies = {
    ui: createReverseProxy({
      target: uiUrl,
      ws: true,
      changeOrigin: true,
    }),
    manage: createReverseProxy({
      target: manageUrl,
      ws: true,
      changeOrigin: false,
    }),
    ai: createReverseProxy({
      target: aiUrl,
      ws: true,
      changeOrigin: true,
    }),
    studio: createReverseProxy({
      target: studioUrl,
      ws: true,
      changeOrigin: true,
    }),
    docs: createReverseProxy({
      target: docsUrl,
      ws: true,
      // Keep the browser Host (engenty.localhost) so Next dev/HMR match the public URL.
      changeOrigin: false,
    }),
  };

  for (const proxy of [proxies.docs, proxies.manage]) {
    proxy.on("proxyReq", (proxyReq, req) => {
      const host = req.headers.host;
      if (host) {
        proxyReq.setHeader("x-forwarded-host", host);
      }
      proxyReq.setHeader("x-forwarded-proto", "https");
    });
  }

  proxies.docs.on("proxyRes", (proxyRes) => {
    const location = proxyRes.headers.location;
    if (typeof location !== "string") {
      return;
    }
    if (location.includes("docs.engenty.localhost")) {
      proxyRes.headers.location = location.replaceAll(
        "https://docs.engenty.localhost",
        "https://engenty.localhost"
      );
    }
  });

  proxies.manage.on("proxyRes", (proxyRes) => {
    const location = proxyRes.headers.location;
    if (typeof location !== "string") {
      return;
    }
    if (location.includes("manage.engenty.localhost")) {
      proxyRes.headers.location = location.replaceAll(
        "https://manage.engenty.localhost",
        "https://engenty.localhost/manage"
      );
    }
  });

  for (const proxy of Object.values(proxies)) {
    proxy.on("error", (error, req, res) => {
      const message = error instanceof Error ? error.message : String(error);
      if (res && "writeHead" in res && !res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end(`Dev gateway proxy error: ${message}`);
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
      logger?.info("Dev gateway enabled", {
        uiUrl,
        manageUrl,
        aiUrl,
        studioUrl,
        docsUrl,
      });
    },
    maybeHandleRequest(req, res, honoListener) {
      const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      const target = resolveGatewayTarget(pathname);
      if (target === null) {
        honoListener(req, res);
        return;
      }
      proxies[target].web(req, res);
    },
    maybeHandleUpgrade(req, socket, head) {
      const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      const netSocket = socket as Socket;
      const target = resolveGatewayTarget(pathname);
      if (target === null) {
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
      if (target === "manage") {
        proxies.manage.ws(req, netSocket, head);
        return;
      }
      proxies.ui.ws(req, netSocket, head);
    },
  };
}
