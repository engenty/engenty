// Dev/prod gateway reverse proxy — replaces unmaintained http-proxy with Node http/https + net.
import type { ClientRequest, IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import net from "node:net";
import { URL } from "node:url";

export interface ReverseProxyOptions {
  changeOrigin?: boolean;
  target: string;
  ws?: boolean;
}

type ProxyReqHandler = (proxyReq: ClientRequest, req: IncomingMessage) => void;
type ProxyResHandler = (proxyRes: IncomingMessage) => void;
type ProxyErrorHandler = (
  error: Error,
  req: IncomingMessage,
  res?: ServerResponse | Socket
) => void;

export interface ReverseProxy {
  on(event: "proxyReq", handler: ProxyReqHandler): ReverseProxy;
  on(event: "proxyRes", handler: ProxyResHandler): ReverseProxy;
  on(event: "error", handler: ProxyErrorHandler): ReverseProxy;
  web(req: IncomingMessage, res: ServerResponse): void;
  ws(req: IncomingMessage, socket: Socket, head: Buffer): void;
}

export function createReverseProxy(options: ReverseProxyOptions): ReverseProxy {
  const targetBase = new URL(options.target);
  const allowWs = options.ws ?? true;
  const changeOrigin = options.changeOrigin ?? false;

  const proxyReqHandlers: ProxyReqHandler[] = [];
  const proxyResHandlers: ProxyResHandler[] = [];
  const errorHandlers: ProxyErrorHandler[] = [];

  const emitError = (
    error: Error,
    req: IncomingMessage,
    res?: ServerResponse | Socket
  ) => {
    for (const handler of errorHandlers) {
      handler(error, req, res);
    }
  };

  const proxy: ReverseProxy = {
    on(event, handler) {
      if (event === "proxyReq") {
        proxyReqHandlers.push(handler as ProxyReqHandler);
      } else if (event === "proxyRes") {
        proxyResHandlers.push(handler as ProxyResHandler);
      } else if (event === "error") {
        errorHandlers.push(handler as ProxyErrorHandler);
      }
      return proxy;
    },

    web(req, res) {
      const incoming = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "127.0.0.1"}`
      );
      const targetUrl = new URL(
        `${incoming.pathname}${incoming.search}`,
        targetBase
      );

      const headers: Record<string, string | string[] | undefined> = {
        ...req.headers,
      };
      if (changeOrigin) {
        headers.host = targetUrl.host;
      }

      const port =
        targetUrl.port || (targetUrl.protocol === "https:" ? "443" : "80");
      const requestOptions: http.RequestOptions = {
        hostname: targetUrl.hostname,
        port: Number(port),
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers,
      };

      const client = targetUrl.protocol === "https:" ? https : http;
      const proxyReq = client.request(requestOptions, (proxyRes) => {
        for (const handler of proxyResHandlers) {
          handler(proxyRes);
        }
        if (!res.headersSent) {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        }
        proxyRes.pipe(res);
      });

      for (const handler of proxyReqHandlers) {
        handler(proxyReq, req);
      }

      proxyReq.on("error", (error) => {
        emitError(error, req, res);
      });

      req.pipe(proxyReq);
    },

    ws(req, socket, head) {
      if (!allowWs) {
        socket.destroy();
        return;
      }

      const defaultPort =
        targetBase.protocol === "https:" || targetBase.protocol === "wss:"
          ? 443
          : 80;
      const port = Number(targetBase.port) || defaultPort;

      const upstream = net.connect({ host: targetBase.hostname, port }, () => {
        const hostHeader = changeOrigin
          ? targetBase.host
          : (req.headers.host ?? targetBase.host);
        const headerLines = [
          `${req.method ?? "GET"} ${req.url ?? "/"} HTTP/1.1`,
          `Host: ${hostHeader}`,
        ];
        for (const [key, value] of Object.entries(req.headers)) {
          if (key.toLowerCase() === "host") {
            continue;
          }
          if (value === undefined) {
            continue;
          }
          const normalized = Array.isArray(value) ? value.join(", ") : value;
          headerLines.push(`${key}: ${normalized}`);
        }
        headerLines.push("", "");
        upstream.write(headerLines.join("\r\n"));
        if (head.length > 0) {
          upstream.write(head);
        }
        upstream.pipe(socket);
        socket.pipe(upstream);
      });

      upstream.on("error", (error) => {
        emitError(error, req, socket);
      });
      socket.on("error", (error) => {
        emitError(error, req, socket);
      });
    },
  };

  return proxy;
}
