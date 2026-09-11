import { createLogger } from "@engenty/telemetry";
import { setup } from "@rivet-dev/agentos";
import {
  AgentOSAppsError,
  appsRouter,
  deployApp,
  setupApps,
} from "@rivet-dev/agentos-apps";
import type { AppPlacement, AppStore } from "./app-store.js";
import type { AppHostConfig } from "./config.js";

const logger = createLogger({ name: "apps/app-host:runtime" });

/**
 * URL-safe app ids only. The id is used for Rivet routing AND namespace
 * isolation, so anything that could escape a path segment is rejected here
 * rather than deeper in the stack.
 *
 * The 63-character ceiling mirrors agentOS's own limit. It used to be 128,
 * which let an over-long id through to `deployApp()` and surface as an opaque
 * build failure instead of a validation error naming the id.
 */
const APP_ID_MAX_LENGTH = 63;
const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

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
      `invalid app id "${appId}" (${appId.length} chars) — expected ` +
        `^[a-z0-9][a-z0-9-]{0,${APP_ID_MAX_LENGTH - 1}}$`
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
    (code?.startsWith("agentos_apps_") ?? false);
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

/**
 * agentOS's `warmTimeoutMs` (30 s, hardcoded upstream — not a config knob)
 * measures how long an execution replica may take to come up. The FIRST deploy
 * into a fresh namespace has to cold-start one, which regularly exceeds that on
 * a loaded dev machine; the identical retry then lands in ~1 s against the now-
 * warm replica. Left alone this makes every new App's first build fail — the
 * agent sees a build failure with no source problem to fix, so it asks the user
 * for files instead of simply retrying, and the App is never published.
 *
 * The warm timeout is the one `agentos_apps_*` code that is a TIMING fact, not
 * a statement about the source, so it is the only one we retry.
 */
const WARM_TIMEOUT_CODE = "agentos_apps_replica_warm_timeout";

export class AppRuntime {
  private readonly config: AppHostConfig;
  private readonly store: AppStore;

  private started = false;

  constructor(config: AppHostConfig, store: AppStore) {
    this.config = config;
    this.store = store;
  }

  /**
   * Boots the embedded Rivet registry. This spawns two native child processes
   * (the Rivet Engine and the agentOS sidecar) and is the reason the container
   * needs a durable `~/.rivetkit` volume: that is where deployed releases live.
   */
  start(): void {
    if (this.started) {
      return;
    }
    const { appsActors } = setupApps({
      // Resolved at every replica boot, not once at deploy, so the mount
      // follows the App's directory wherever the last deploy placed it.
      replicaOptions: ({ appId }) => ({
        mounts: [this.dataMount(appId)],
        // Root inside the isolate. The isolate is the boundary (the kernel,
        // the read-only /app mount, egress); the guest uid only decides DAC
        // on /data, and the sidecar's node:sqlite write-back checks it against
        // the HOST file's uid — which is never 1000 — so the default user
        // could not write its own database back.
        user: { egid: 0, euid: 0, gid: 0, uid: 0 },
      }),
    });
    const registry = setup({ use: { ...appsActors } });
    registry.start();
    this.started = true;
    logger.info("agentOS Apps registry started");
  }

  /**
   * `/data` inside the isolate: the App's data directory projected in through
   * agentOS's `host_dir` plugin, read-write. It is keyed by App, not by
   * release — the replica actor's own filesystem dies with the release, this
   * directory does not.
   */
  private dataMount(appId: string) {
    return {
      path: "/data",
      plugin: {
        id: "host_dir",
        config: { hostPath: this.store.dataDir(appId), readOnly: false },
      },
      readOnly: false,
    };
  }

  async deploy(input: {
    app: AppPlacement;
    appId: string;
    files: Record<string, string>;
  }): Promise<DeployResult> {
    assertAppId(input.appId);
    // Place the App ahead of the build so the first replica boot finds its
    // directory, and so a broken spaces volume fails here with a filesystem
    // error instead of as an opaque replica warm failure.
    await this.store.place(input.appId, input.app);

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
    // One retry, and only for the cold-start warm timeout (see above). Every
    // other failure is reported on the first attempt: a real build error must
    // reach the agent immediately, not twice as slowly.
    for (let attempt = 0; ; attempt++) {
      try {
        const deployment = await deployApp({
          appId: input.appId,
          createNamespace: this.config.perAppNamespace,
          files: input.files,
          scaling: this.config.scaling,
        });
        logger.info("app deployed", {
          appId: input.appId,
          attempt,
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
        if (buildFailure?.detail.code === WARM_TIMEOUT_CODE && attempt === 0) {
          logger.warn("replica warm timed out — retrying once", {
            appId: input.appId,
            elapsedMs: Date.now() - startedAt,
          });
          continue;
        }
        if (buildFailure) {
          logger.warn("app build failed", {
            appId: input.appId,
            attempt,
            code: buildFailure.detail.code,
            elapsedMs: Date.now() - startedAt,
          });
          throw buildFailure;
        }
        throw error;
      }
    }
  }

  /**
   * Take an app offline by activating a release that answers everything with
   * 410. agentOS Apps exposes no delete primitive, so a tombstone release is
   * the honest equivalent — the app id stays reserved and its stored state is
   * untouched, which also makes this reversible by redeploying. The App's
   * directory is left in place for the same reason.
   */
  async destroy(appId: string, app: AppPlacement): Promise<DeployResult> {
    assertAppId(appId);
    return await this.deploy({
      app,
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
