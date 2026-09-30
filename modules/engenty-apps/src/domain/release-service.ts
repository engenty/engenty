import type { AppsRepoSupabase } from "../dal/supabase.js";
import {
  type AppHostBuildError,
  type AppHostClient,
  type AppPlacement,
  appHostId,
} from "../lib/app-host-client.js";
import type {
  ActorKind,
  App,
  AppManifest,
  AppVersion,
} from "../schema/types.js";
import { APP_MANIFEST_FILE, appManifestSchema } from "../schema/zod.js";
import {
  bundleFrontend,
  FrontendBuildError,
  isBundledEntry,
} from "./frontend-bundler.js";

export interface ReleaseServiceDeps {
  appHost: AppHostClient | null;
  /** Whether an operation id exists in the gateway's registry. */
  hasOperation: (operationId: string) => boolean;
  repo: AppsRepoSupabase;
  tenantId: string;
}

export interface ReleaseActor {
  createdBy: string | null;
  kind: ActorKind;
}

export interface ProposeResult {
  app: App;
  version: AppVersion;
}

const EMPTY_MANIFEST: AppManifest = {
  actions: [],
  egress: { connect: [] },
  engenty: { operations: [], tables: [] },
  entry: { frontend: "index.html" },
  name: "",
  storage: { config: false, data: false },
};

/** Where the App lives on the app host's spaces tree. */
export function placementOf(app: App, tenantId: string): AppPlacement {
  return { slug: app.slug, spaceId: app.space_id, tenantId };
}

function isBuildError(error: unknown): error is AppHostBuildError {
  return (
    error instanceof Error &&
    error.name === "AppHostBuildError" &&
    "detail" in error
  );
}

function refuse(code: string, details?: unknown): Error {
  const error = new Error(code) as Error & { details?: unknown };
  error.details = details;
  return error;
}

/**
 * Compose what actually ships to the app host.
 *
 * Two deliberate injections on top of the committed tree:
 *
 * - The built frontend goes in as `index.html`, putting bundle mode in the
 *   same deploy shape as a hand-written document.
 * - When the manifest declares a backend, a synthetic `package.json` naming it
 *   as `main` goes in too. Without one, agentOS's plan resolver sees
 *   `index.html`, classifies the whole deployment as a static site, and the
 *   backend never executes — `POST /collect` comes back `405 Allow: GET, HEAD`
 *   from a file server. `type: module` because the documented backend shape
 *   is `export default { fetch }`.
 *
 * An app that ships its own `package.json` is left alone: the author has
 * taken over the plan, and clobbering it would be worse than trusting it.
 */
export function composeDeployFiles(input: {
  appId: string;
  backend: string | undefined;
  files: Record<string, string>;
  frontendHtml: string | null;
}): Record<string, string> {
  const out: Record<string, string> = input.frontendHtml
    ? { ...input.files, "index.html": input.frontendHtml }
    : { ...input.files };
  if (input.backend && !out["package.json"]) {
    out["package.json"] = JSON.stringify({
      main: input.backend,
      name: `engenty-app-${input.appId}`,
      private: true,
      type: "module",
    });
  }
  return out;
}

/**
 * Release the App's work tree: commit what is uncommitted, build the commit,
 * deploy its backend, and leave the version proposed, awaiting approval.
 *
 * The build runs BEFORE approval on purpose: asking a human to sign off on a
 * release that does not compile wastes their attention, and the build log is
 * what engenty.app-coder iterates against. A commit that does not build is
 * recorded as a `failed` version carrying that log; the agent fixes the tree
 * and proposes again, which is a new commit and a new version.
 */
export async function proposeRelease(
  deps: ReleaseServiceDeps,
  input: { actor: ReleaseActor; appId: string; note?: string }
): Promise<ProposeResult> {
  const app = await deps.repo.getApp(input.appId);
  if (!app) {
    throw new Error("app_not_found");
  }
  if (app.status === "archived") {
    throw new Error("app_archived");
  }
  if (!deps.appHost) {
    throw new Error("app_host_unavailable");
  }
  const appHost = deps.appHost;
  const hostId = appHostId(deps.tenantId, app.id);
  const placement = placementOf(app, deps.tenantId);

  const commit = await appHost.writeSource(hostId, placement, {
    message: input.note ?? "release",
  });
  // Releasing the same commit twice is one release: whoever asked first has
  // the version, whether it is still proposed or already live.
  const versions = await deps.repo.listVersions(app.id);
  const existing = versions.find(
    (version) => version.sha === commit.sha && version.status !== "failed"
  );
  if (existing) {
    return { app, version: existing };
  }

  const tree = await appHost.readSource(hostId, commit.sha);
  let manifest: AppManifest | null = null;

  const fail = async (
    buildLog: string,
    code: string,
    details?: unknown
  ): Promise<never> => {
    const attempt = await deps.repo.createVersion(
      { appId: app.id, manifest: manifest ?? EMPTY_MANIFEST, sha: commit.sha },
      input.actor
    );
    await deps.repo.updateVersion(attempt.id, {
      build_log: buildLog,
      status: "failed",
    });
    throw refuse(code, details);
  };

  const manifestText = tree.files[APP_MANIFEST_FILE];
  if (typeof manifestText !== "string") {
    return fail(
      `${APP_MANIFEST_FILE} is not among the app's files`,
      "app_manifest_invalid"
    );
  }
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestText);
  } catch (error) {
    return fail(
      `${APP_MANIFEST_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      "app_manifest_invalid"
    );
  }
  const parsed = appManifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    return fail(
      `manifest is invalid:\n${detail}`,
      "app_manifest_invalid",
      parsed.error.issues
    );
  }
  manifest = parsed.data;

  // A declared operation that does not exist would only be found at the
  // App's first call. Refuse it here, where the agent can still fix the name.
  const unknownOperations = manifest.engenty.operations.filter(
    (operationId) => !deps.hasOperation(operationId)
  );
  if (unknownOperations.length > 0) {
    return fail(
      `manifest declares operations that do not exist: ${unknownOperations.join(", ")}`,
      "app_manifest_invalid",
      { unknownOperations }
    );
  }

  const frontend = manifest.entry.frontend;
  if (typeof tree.files[frontend] !== "string") {
    return fail(
      `entry.frontend "${frontend}" is not among the app's files`,
      "app_entry_missing"
    );
  }
  const backend = manifest.entry.backend;
  if (backend && typeof tree.files[backend] !== "string") {
    return fail(
      `entry.backend "${backend}" is not among the app's files`,
      "app_entry_missing"
    );
  }

  // The frontend is built BEFORE the app host is asked for anything: an
  // esbuild pass costs milliseconds where a cold agentOS build VM costs half a
  // minute, so a mistyped component should not spend a deploy cycle to find.
  let frontendHtml: string;
  if (isBundledEntry(frontend)) {
    try {
      frontendHtml = (
        await bundleFrontend({
          entry: frontend,
          files: tree.files,
          title: app.name,
        })
      ).html;
    } catch (error) {
      if (error instanceof FrontendBuildError) {
        return fail(error.buildLog, "app_build_failed", {
          buildLog: error.buildLog,
        });
      }
      throw error;
    }
  } else {
    frontendHtml = tree.files[frontend];
  }

  const version = await deps.repo.createVersion(
    { appId: app.id, manifest, sha: commit.sha },
    input.actor
  );
  try {
    const deployment = await appHost.deploy(
      hostId,
      placement,
      composeDeployFiles({
        appId: app.id,
        backend,
        files: tree.files,
        frontendHtml,
      })
    );
    const built = await deps.repo.updateVersion(version.id, {
      build_log: null,
      frontend_html: frontendHtml,
      release: deployment.release,
    });
    return { app, version: built ?? version };
  } catch (error) {
    const buildLog = isBuildError(error)
      ? error.detail.buildLog
      : error instanceof Error
        ? error.message
        : String(error);
    await deps.repo.updateVersion(version.id, {
      build_log: buildLog,
      release: null,
      status: "failed",
    });
    if (isBuildError(error)) {
      throw refuse("app_build_failed", error.detail);
    }
    throw error;
  }
}

/**
 * Activate a proposed version. This is the governance act — the caller must
 * hold `apps.approve`, which is enforced at the operation contract, not here.
 */
export async function approveRelease(
  deps: Pick<ReleaseServiceDeps, "repo">,
  input: { appId: string; version: number }
): Promise<ProposeResult> {
  const app = await deps.repo.getApp(input.appId);
  if (!app) {
    throw new Error("app_not_found");
  }
  const version = await deps.repo.getVersionByNumber(
    input.appId,
    input.version
  );
  if (!version) {
    throw new Error("app_version_not_found");
  }
  if (version.status !== "proposed") {
    throw new Error("app_version_not_proposed");
  }
  if (!version.release) {
    // Approving an unbuilt version would activate something that cannot serve.
    throw new Error("app_version_not_built");
  }

  const activated = await deps.repo.updateVersion(version.id, {
    deployed_at: new Date().toISOString(),
    status: "active",
  });
  await deps.repo.archiveOtherActiveVersions(input.appId, version.id);
  const updated = await deps.repo.updateApp(input.appId, {
    active_version_id: version.id,
    status: "active",
  });

  return { app: updated ?? app, version: activated ?? version };
}

/**
 * Reject a proposed version. The currently active version is untouched — a
 * rejected proposal must never take an App offline.
 */
export async function rejectRelease(
  deps: Pick<ReleaseServiceDeps, "repo">,
  input: { appId: string; reason?: string; version: number }
): Promise<AppVersion> {
  const version = await deps.repo.getVersionByNumber(
    input.appId,
    input.version
  );
  if (!version) {
    throw new Error("app_version_not_found");
  }
  if (version.status !== "proposed") {
    throw new Error("app_version_not_proposed");
  }
  const rejected = await deps.repo.updateVersion(version.id, {
    build_log: input.reason
      ? `rejected: ${input.reason}`
      : (version.build_log ?? null),
    status: "archived",
  });
  return rejected ?? version;
}

/**
 * Roll back to a previously released version: its commit is read from the
 * repository and its backend redeployed; the frontend document stored at
 * release time is reused byte for byte rather than rebuilt with a toolchain
 * that may have moved on.
 */
export async function rollbackRelease(
  deps: ReleaseServiceDeps,
  input: { appId: string; version: number }
): Promise<ProposeResult> {
  const app = await deps.repo.getApp(input.appId);
  if (!app) {
    throw new Error("app_not_found");
  }
  const target = await deps.repo.getVersionByNumber(input.appId, input.version);
  if (!target) {
    throw new Error("app_version_not_found");
  }
  if (target.status === "failed" || !target.frontend_html) {
    throw new Error("app_version_not_built");
  }
  if (!deps.appHost) {
    throw new Error("app_host_unavailable");
  }

  const hostId = appHostId(deps.tenantId, app.id);
  const tree = await deps.appHost.readSource(hostId, target.sha);
  const deployment = await deps.appHost.deploy(
    hostId,
    placementOf(app, deps.tenantId),
    composeDeployFiles({
      appId: app.id,
      backend: target.manifest.entry?.backend,
      files: tree.files,
      frontendHtml: target.frontend_html,
    })
  );
  const restored = await deps.repo.updateVersion(target.id, {
    deployed_at: new Date().toISOString(),
    release: deployment.release,
    status: "active",
  });
  await deps.repo.archiveOtherActiveVersions(input.appId, target.id);
  const updated = await deps.repo.updateApp(input.appId, {
    active_version_id: target.id,
    status: "active",
  });
  return { app: updated ?? app, version: restored ?? target };
}
