"use client";

import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Badge, Button } from "@engenty/ui-core";
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
      payload?.message ??
        payload?.error ??
        `App call failed (HTTP ${res.status})`
    );
  }
  return payload?.result ?? {};
}

export function appFrontendQueryKey(appId: string, version?: number) {
  return ["app-frontend", appId, version ?? "active"] as const;
}

interface AppReview {
  can_approve: boolean;
  review: {
    actions: { id: string; requiresApproval?: boolean; risk: string }[];
    egress: string[];
    operations: string[];
    status: string;
    version: number;
  } | null;
}

async function fetchAppReview(
  appId: string,
  version?: number
): Promise<AppReview> {
  const base = resolveEngentyAiServiceBaseUrlSafe();
  const headers = await appsAiRequestHeaders();
  const query = version === undefined ? "" : `?version=${version}`;
  const res = await fetch(`${base}/ai/apps/${appId}/review${query}`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`Could not load app review (HTTP ${res.status})`);
  }
  return (await res.json()) as AppReview;
}

async function postAppReviewDecision(params: {
  appId: string;
  decision: "approve" | "reject";
  version: number;
}): Promise<void> {
  const base = resolveEngentyAiServiceBaseUrlSafe();
  const headers = await appsAiRequestHeaders();
  const res = await fetch(`${base}/ai/apps/${params.appId}/review`, {
    body: JSON.stringify({
      decision: params.decision,
      version: params.version,
    }),
    headers: { ...headers, "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(payload?.message ?? `Decision failed (HTTP ${res.status})`);
  }
}

export function appReviewQueryKey(appId: string, version?: number) {
  return ["app-review", appId, version ?? "proposed"] as const;
}

/**
 * The consent surface. A proposed version renders what it ASKS FOR — every
 * declared operation and action, high-risk ones marked — right above the
 * running preview, so the human reads the manifest at the moment they decide.
 * Holders of `apps.approve` get the decision buttons; everyone else sees that
 * the version is waiting. Core re-checks the capability on the decision call,
 * so this banner is honesty, not enforcement.
 */
function AppReviewBanner({
  appId,
  version,
}: {
  appId: string;
  version?: number;
}) {
  const queryClient = useQueryClient();
  const reviewQuery = useQuery({
    enabled: Boolean(appId),
    queryFn: () => fetchAppReview(appId, version),
    queryKey: appReviewQueryKey(appId, version),
  });
  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      postAppReviewDecision({
        appId,
        decision,
        version: reviewQuery.data?.review?.version as number,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: appReviewQueryKey(appId, version),
      });
    },
  });

  const review = reviewQuery.data?.review;
  if (review?.status !== "proposed") {
    return null;
  }
  const highRiskActions = review.actions.filter(
    (action) => action.risk === "high" || action.requiresApproval === true
  );

  return (
    <div className="border-b bg-muted/50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium">
            Version {review.version} awaits approval.
          </span>{" "}
          <span className="text-muted-foreground">This app asks for:</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {review.operations.map((operationId) => (
              <Badge key={operationId} variant="secondary">
                {operationId}
              </Badge>
            ))}
            {highRiskActions.map((action) => (
              <Badge
                className="border-destructive/50 text-destructive"
                key={action.id}
                variant="outline"
              >
                {action.id} · approval-gated
              </Badge>
            ))}
            {review.operations.length === 0 && highRiskActions.length === 0 && (
              <span className="text-muted-foreground">
                nothing beyond its own frame
              </span>
            )}
          </div>
        </div>
        {reviewQuery.data?.can_approve ? (
          <div className="flex shrink-0 gap-2">
            <Button
              disabled={decide.isPending}
              onClick={() => decide.mutate("approve")}
              size="sm"
            >
              Approve
            </Button>
            <Button
              disabled={decide.isPending}
              onClick={() => decide.mutate("reject")}
              size="sm"
              variant="outline"
            >
              Reject
            </Button>
          </div>
        ) : (
          <span className="shrink-0 text-muted-foreground">
            Waiting for an approver
          </span>
        )}
      </div>
      {decide.isError ? (
        <div className="mt-2 text-destructive">
          {decide.error instanceof Error
            ? decide.error.message
            : "The decision could not be recorded."}
        </div>
      ) : null}
    </div>
  );
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
    <div className="flex min-h-0 flex-1 flex-col">
      <AppReviewBanner appId={appId} version={appVersion} />
      <BridgedFrame
        callTool={callTool}
        // Egress is deny-all unless the manifest declares hosts; the frame's CSP
        // base is `default-src 'none'`, so an undeclared host cannot be reached
        // even if the app's code tries.
        csp={
          declaredHosts.length > 0
            ? { connectDomains: declaredHosts }
            : undefined
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
    </div>
  );
}
