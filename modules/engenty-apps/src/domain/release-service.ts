import type { AppsRepoSupabase } from "../dal/supabase.js";
import {
  type AppHostBuildError,
  type AppHostClient,
  appHostId,
} from "../lib/app-host-client.js";
import { appManifestSchema } from "../schema/zod.js";
import type { App, AppVersion } from "../schema/types.js";
import {
  bundleFrontend,
  FrontendBuildError,
  isBundledEntry,
} from "./frontend-bundler.js";

export interface ReleaseServiceDeps {
  appHost: AppHostClient | null;
  repo: AppsRepoSupabase;
  tenantId: string;
}

export interface ProposeResult {
  app: App;
  version: AppVersion;
}

function isBuildError(error: unknown): error is AppHostBuildError {
  return (
    error instanceof Error &&
    error.name === "AppHostBuildError" &&
    "detail" in error
  );
}

/**
 * Build the current draft and leave it proposed, awaiting approval.
 *
 * The build runs BEFORE approval on purpose: asking a human to sign off on a
 * release that does not compile wastes their attention, and the build log is
 * what engenty.app-coder iterates against. A failed build updates the draft in
 * place and throws, so the agent can read `build_log`, fix, and propose again
 * without churning version numbers.
 */
export async function proposeRelease(
  deps: ReleaseServiceDeps,
  input: { appId: string }
): Promise<ProposeResult> {
  const app = await deps.repo.getApp(input.appId);
  if (!app) {
    throw new Error("app_not_found");
  }
  if (app.status === "archived") {
    throw new Error("app_archived");
  }

  const versions = await deps.repo.listVersions(input.appId);
  const draft = versions.find((version) => version.status === "proposed");
  if (!draft) {
    throw new Error("app_no_draft_version");
  }

  const manifest = appManifestSchema.safeParse(draft.manifest);
  if (!manifest.success) {
    const detail = manifest.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    await deps.repo.updateVersion(draft.id, {
      build_log: `manifest is invalid:\n${detail}`,
    });
    const error = new Error("app_manifest_invalid") as Error & {
      details?: unknown;
    };
    error.details = manifest.error.issues;
    throw error;
  }

  const frontend = manifest.data.entry.frontend;
  if (!draft.files[frontend]) {
    await deps.repo.updateVersion(draft.id, {
      build_log: `entry.frontend "${frontend}" is not among the app's files`,
    });
    throw new Error("app_entry_missing");
  }

  /*
   * The frontend is bundled BEFORE the app host is asked for anything: an
   * esbuild pass costs milliseconds where a cold agentOS build VM costs half a
   * minute, so a mistyped component should not spend a deploy cycle to find.
   */
  let frontendHtml: string | null = null;
  if (isBundledEntry(frontend)) {
    try {
      const bundled = await bundleFrontend({
        entry: frontend,
        files: draft.files,
        title: app.name,
      });
      frontendHtml = bundled.html;
    } catch (error) {
      if (error instanceof FrontendBuildError) {
        await deps.repo.updateVersion(draft.id, {
          build_log: error.buildLog,
          frontend_html: null,
          release: null,
        });
        const wrapped = new Error("app_build_failed") as Error & {
          details?: unknown;
        };
        wrapped.details = { buildLog: error.buildLog };
        throw wrapped;
      }
      throw error;
    }
  }

  if (!deps.appHost) {
    throw new Error("app_host_unavailable");
  }

  try {
    /*
     * Bundle-mode sources contain no `index.html`, and agentOS refuses to
     * resolve a deployment without one (or a package.json). Shipping the built
     * document under that name puts bundle mode in exactly the same deploy
     * shape as an inline App — no second code path on the host side.
     */
    const deployFiles = frontendHtml
      ? { ...draft.files, "index.html": frontendHtml }
      : draft.files;
    const deployment = await deps.appHost.deploy(
      appHostId(deps.tenantId, app.id),
      deployFiles
    );
    const built = await deps.repo.updateVersion(draft.id, {
      build_log: null,
      frontend_html: frontendHtml,
      manifest: manifest.data,
      release: deployment.release,
    });
    return { app, version: built ?? draft };
  } catch (error) {
    if (isBuildError(error)) {
      await deps.repo.updateVersion(draft.id, {
        build_log: error.detail.buildLog,
        release: null,
      });
      const wrapped = new Error("app_build_failed") as Error & {
        details?: unknown;
      };
      wrapped.details = error.detail;
      throw wrapped;
    }
    throw error;
  }
}

/**
 * Activate a proposed version. This is the governance act — the caller must
 * hold `apps.approve`, which is enforced at the operation contract, not here.
 */
export async function approveRelease(
  deps: ReleaseServiceDeps,
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
  deps: ReleaseServiceDeps,
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
 * Roll back to a previously active version by re-deploying its stored files.
 * Postgres holds the source, so this needs nothing from the app host's own
 * state — which is exactly why the source lives here.
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
  if (!deps.appHost) {
    throw new Error("app_host_unavailable");
  }

  // The built document was stored at propose time, so a rollback re-deploys
  // byte-for-byte what was approved rather than rebuilding it from sources
  // that a newer toolchain might now compile differently.
  const deployment = await deps.appHost.deploy(
    appHostId(deps.tenantId, app.id),
    target.frontend_html
      ? { ...target.files, "index.html": target.frontend_html }
      : target.files
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
