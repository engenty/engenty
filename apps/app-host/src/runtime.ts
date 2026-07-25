import { createLogger } from "@engenty/telemetry";
import { setup } from "@rivet-dev/agentos";
import {
  AgentOSAppsError,
  appsRouter,
  deployApp,
  setupApps,
} from "@rivet-dev/agentos-apps";
import type { AppHostConfig } from "./config.js";

const logger = createLogger({ name: "apps/app-host:runtime" });

/**
 * URL-safe app ids only. The id is used for Rivet routing AND namespace
 * isolation, so anything that could escape a path segment is rejected here
 * rather than deeper in the stack.
 */
const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;

export interface DeployResult {
  appId: string;
  namespace: string;
  pool: string;
  regions: string[];
  release: string;
}

export interface AppBuildError {
  /** Compiler/bundler/packer output, verbatim — this is what engenty.app-coder reads. */
  buildLog: string;
  code: string;
  message: string;
}

export class AppBuildFailure extends Error {
  readonly detail: AppBuildError;

  constructor(detail: AppBuildError) {
    super(detail.message);
    this.name = "AppBuildFailure";
    this.detail = detail;
  }
}

export interface GuestRequest {
  body?: string | null;
  headers?: Record<string, string>;
  method: string;
  /** Path inside the app, leading slash included. */
  path: string;
}

export interface GuestResponse {
  body: string;
  headers: Record<string, string>;
  status: number;
}

export function assertAppId(appId: string): void {
  if (!APP_ID_RE.test(appId)) {
    throw new Error(
      `invalid app id "${appId}" — expected ^[a-z0-9][a-z0-9-]{0,127}$`
    );
  }
}

/**
 * agentOS Apps raises build failures inside the app actor, so by the time they
 * reach us they have crossed an actor RPC boundary and been re-hydrated as a
 * plain `RivetError` — `instanceof AgentOSAppsError` is false even though the
 * shape is intact. Detect by contract (an `agentos_apps_*` code carrying the
 * guest command's stdio) rather than by class, or every build error degrades to
 * an opaque 500 and engenty.app-coder has nothing to iterate against.
 */
export function toBuildFailure(error: unknown): AppBuildFailure | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    metadata?: { stderr?: unknown; stdout?: unknown };
  };
  const code = typeof candidate.code === "string" ? candidate.code : null;
  const isAppsError =
    error instanceof AgentOSAppsError ||
    (code !== null && code.startsWith("agentos_apps_"));
  if (!(isAppsError && code)) {
    return null;
  }
  const message =
    typeof candidate.message === "string" ? candidate.message : code;
  const metadata = candidate.metadata ?? {};
  const buildLog = [metadata.stdout, metadata.stderr]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join("\n");
  return new AppBuildFailure({
    buildLog: buildLog || message,
    code,
    message,
  });
}

export class AppRuntime {
  private readonly config: AppHostConfig;

  private started = false;

  constructor(config: AppHostConfig) {
    this.config = config;
  }

  /**
   * Boots the embedded Rivet registry. This spawns two native child processes
   * (the Rivet Engine and the agentOS sidecar) and is the reason the container
   * needs a durable `~/.rivetkit` volume — see SPIKE-agentos-apps.md §1.
   */
  start(): void {
    if (this.started) {
      return;
    }
    const { appsActors } = setupApps();
    const registry = setup({ use: { ...appsActors } });
    registry.start();
    this.started = true;
    logger.info("agentOS Apps registry started");
  }

  async deploy(input: {
    appId: string;
    files: Record<string, string>;
  }): Promise<DeployResult> {
    assertAppId(input.appId);

    const totalBytes = Object.values(input.files).reduce(
      (sum, content) => sum + Buffer.byteLength(content, "utf8"),
      0
    );
    if (totalBytes > this.config.maxSourceBytes) {
      throw new Error(
        `app source is ${totalBytes} bytes, over the ${this.config.maxSourceBytes} byte limit`
      );
    }

    const startedAt = Date.now();
    try {
      const deployment = await deployApp({
        appId: input.appId,
        createNamespace: this.config.perAppNamespace,
        files: input.files,
        scaling: this.config.scaling,
      });
      logger.info("app deployed", {
        appId: input.appId,
        elapsedMs: Date.now() - startedAt,
        release: deployment.release,
      });
      return {
        appId: deployment.appId,
        namespace: deployment.namespace,
        pool: deployment.pool,
        regions: deployment.regions,
        release: deployment.release,
      };
    } catch (error) {
      const buildFailure = toBuildFailure(error);
      if (buildFailure) {
        logger.warn("app build failed", {
          appId: input.appId,
          code: buildFailure.detail.code,
          elapsedMs: Date.now() - startedAt,
        });
        throw buildFailure;
      }
      throw error;
    }
  }

  /**
   * Take an app offline by activating a release that answers everything with
   * 410. agentOS Apps exposes no delete primitive, so a tombstone release is
   * the honest equivalent — the app id stays reserved and its stored state is
   * untouched, which also makes this reversible by redeploying.
   */
  async destroy(appId: string): Promise<DeployResult> {
    assertAppId(appId);
    return await this.deploy({
      appId,
      files: {
        "index.js": [
          "export default {",
          "  fetch() {",
          '    return new Response("app archived", { status: 410 });',
          "  },",
          "};",
        ].join("\n"),
        "package.json": JSON.stringify({
          main: "index.js",
          name: `archived-${appId}`,
          private: true,
          type: "module",
        }),
      },
    });
  }

  /**
   * Issue a request into a deployed app. Goes through `appsRouter` in-process
   * rather than over the network, so the guest surface is never bound to a
   * socket anyone else could reach.
   */
  async request(appId: string, req: GuestRequest): Promise<GuestResponse> {
    assertAppId(appId);
    const path = req.path.startsWith("/") ? req.path : `/${req.path}`;
    const url = `http://app-host.internal/${appId}${path}`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs
    );
    try {
      const response = await appsRouter.fetch(
        new Request(url, {
          body: req.body ?? undefined,
          headers: req.headers ?? {},
          method: req.method,
          signal: controller.signal,
        })
      );
      return {
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()),
        status: response.status,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
