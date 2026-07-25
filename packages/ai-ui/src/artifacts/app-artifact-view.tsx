"use client";

import { useQuery } from "@engenty/query-client";
import { useCallback, useMemo, useRef } from "react";
import { appsAiRequestHeaders } from "../ag-ui/apps-ai/apps-ai-api.js";
import {
  BridgedFrame,
  type BridgedFrameHandle,
} from "../components/copilot/tool-call/bridged-frame.js";
import type { ArtifactViewProps } from "./artifact-renderers.js";
import { resolveEngentyAiServiceBaseUrlSafe } from "./artifacts-api.js";

/**
 * Renderer for artifacts of type `app` — a running engenty App.
 *
 * The artifact's content is a small handle, not the app itself: the App lives
 * in `module_apps` and runs on the app host. That indirection is what lets the
 * frame survive artifact version bumps, and what keeps the artifact well under
 * the 256 KB inline-content cap however large the App grows.
 *
 * Everything the guest can do goes through one call: `tools/call` over
 * postMessage → `POST /ai/apps/:appId/call` with the *viewing user's* own JWT.
 * The App never holds a credential of any kind.
 */

export interface AppArtifactHandle {
  app_id: string;
  app_version?: number;
  session_id: string;
}

export function parseAppHandle(
  content: string | null
): AppArtifactHandle | null {
  if (!content) {
    return null;
  }
  try {
    const parsed = JSON.parse(content) as Partial<AppArtifactHandle>;
    if (
      typeof parsed?.app_id !== "string" ||
      typeof parsed?.session_id !== "string"
    ) {
      return null;
    }
    return {
      app_id: parsed.app_id,
      session_id: parsed.session_id,
      ...(typeof parsed.app_version === "number"
        ? { app_version: parsed.app_version }
        : {}),
    };
  } catch {
    return null;
  }
}

interface AppFrontend {
  html: string;
  manifest: { egress?: { connect?: string[] } };
  version: number;
}

async function fetchAppFrontend(
  appId: string,
  version?: number
): Promise<AppFrontend> {
  const base = resolveEngentyAiServiceBaseUrlSafe();
  const headers = await appsAiRequestHeaders();
  const query = version === undefined ? "" : `?version=${version}`;
  const res = await fetch(`${base}/ai/apps/${appId}/frontend${query}`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`Could not load app (HTTP ${res.status})`);
  }
  return (await res.json()) as AppFrontend;
}

async function callAppAction(params: {
  appId: string;
  args: Record<string, unknown>;
  name: string;
  sessionId: string;
}): Promise<unknown> {
  const base = resolveEngentyAiServiceBaseUrlSafe();
  const headers = await appsAiRequestHeaders();
  const res = await fetch(`${base}/ai/apps/${params.appId}/call`, {
    body: JSON.stringify({
      arguments: params.args,
      name: params.name,
      session_id: params.sessionId,
    }),
    headers: { ...headers, "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
    result?: unknown;
  } | null;
  if (!res.ok) {
    // Surface the proxy's own reason — "this app never declared that
    // operation" is far more useful to a developer than "HTTP 403".
    throw new Error(
      payload?.message ?? payload?.error ?? `App call failed (HTTP ${res.status})`
    );
  }
  return payload?.result ?? {};
}

export function appFrontendQueryKey(appId: string, version?: number) {
  return ["app-frontend", appId, version ?? "active"] as const;
}

export function AppArtifactView({ artifact, content }: ArtifactViewProps) {
  const handle = useMemo(() => parseAppHandle(content), [content]);
  const frameHandle = useRef<BridgedFrameHandle | null>(null);

  const appId = handle?.app_id ?? "";
  const appVersion = handle?.app_version;

  // Keyed on the immutable release, NOT on the artifact content string: a
  // session_id change or a no-op version bump must not tear down a running
  // frame and destroy whatever the user was in the middle of.
  const frontendQuery = useQuery({
    enabled: Boolean(appId),
    queryFn: () => fetchAppFrontend(appId, appVersion),
    queryKey: appFrontendQueryKey(appId, appVersion),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sessionId = handle?.session_id ?? "";
  const callTool = useCallback(
    (name: string, args: Record<string, unknown>) =>
      callAppAction({ appId, args, name, sessionId }),
    [appId, sessionId]
  );

  if (!handle) {
    return (
      <div className="min-h-0 flex-1 p-6 text-muted-foreground text-sm">
        This app artifact is missing its app reference.
      </div>
    );
  }

  if (frontendQuery.isPending) {
    return (
      <div className="min-h-0 flex-1 p-6 text-muted-foreground text-sm">
        Loading app…
      </div>
    );
  }

  if (frontendQuery.isError || !frontendQuery.data) {
    return (
      <div className="min-h-0 flex-1 p-6 text-destructive text-sm">
        {frontendQuery.error instanceof Error
          ? frontendQuery.error.message
          : "Could not load this app."}
      </div>
    );
  }

  const declaredHosts = frontendQuery.data.manifest?.egress?.connect ?? [];

  return (
    <BridgedFrame
      callTool={callTool}
      // Egress is deny-all unless the manifest declares hosts; the frame's CSP
      // base is `default-src 'none'`, so an undeclared host cannot be reached
      // even if the app's code tries.
      csp={
        declaredHosts.length > 0 ? { connectDomains: declaredHosts } : undefined
      }
      fit="fill"
      frameKey={`${appId}:${frontendQuery.data.version}`}
      handleRef={frameHandle}
      html={frontendQuery.data.html}
      initialData={{
        structuredContent: { session_id: handle.session_id },
      }}
      title={artifact.title}
    />
  );
}
