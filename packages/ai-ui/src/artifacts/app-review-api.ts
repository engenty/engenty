"use client";

/**
 * What a proposed App version ASKS FOR, and the decision on it.
 *
 * Lives apart from the artifact view because two surfaces read the same
 * answer: the banner above the running preview, and the row on the Space home
 * that says an App is waiting. One query key means the card and the banner
 * cannot disagree, and deciding on one refreshes the other.
 */

import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { appsAiRequestHeaders } from "../ag-ui/apps-ai/apps-ai-api.js";
import { resolveEngentyAiServiceBaseUrlSafe } from "./artifacts-api.js";

export interface AppReviewAction {
  id: string;
  requiresApproval?: boolean;
  risk: string;
  /** The manifest's own sentence about what this action does. */
  summary?: string;
}

export interface AppReviewOperation {
  id: string;
  /** The module or connector the operation belongs to. */
  module: string | null;
  /** The operation's own one-line contract summary. */
  summary: string | null;
}

/** A declared Space table, named — an id alone tells a person nothing. */
export interface AppReviewTable {
  id: string;
  title: string | null;
}

export interface AppReviewDetail {
  actions: AppReviewAction[];
  /** Hosts the frame may reach; everything else is denied by the CSP. */
  egress: string[];
  operations: AppReviewOperation[];
  sha: string;
  status: string;
  storage: { config?: boolean; data?: boolean };
  tables: AppReviewTable[];
  version: number;
}

export interface AppReview {
  can_approve: boolean;
  review: AppReviewDetail | null;
}

export async function fetchAppReview(
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

export async function postAppReviewDecision(params: {
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
 * The built frontend of one release. Lives here rather than beside the view
 * because a DECISION is what makes it stale: an activated version answers
 * calls its proposed self was denied.
 */
export function appFrontendQueryKey(appId: string, version?: number) {
  return ["app-frontend", appId, version ?? "active"] as const;
}

export function useAppReviewQuery(appId: string, version?: number) {
  return useQuery({
    enabled: Boolean(appId),
    queryFn: () => fetchAppReview(appId, version),
    queryKey: appReviewQueryKey(appId, version),
  });
}

/**
 * Approve or reject. `apps.approve` is a plain POST — no run to resume, no
 * stream to open — which is why a Space-home card may carry these buttons
 * where it must send every other verdict back into the conversation.
 *
 * Core re-checks the capability, so `can_approve` here is honesty, not
 * enforcement.
 */
export function useAppReviewDecision(params: {
  appId: string;
  reviewVersion: number | undefined;
  /** The version the query is keyed on — usually the artifact's pin. */
  version?: number | undefined;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      postAppReviewDecision({
        appId: params.appId,
        decision,
        version: params.reviewVersion as number,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: appReviewQueryKey(params.appId, params.version),
      });
      // The running frame was loaded while the version was still proposed, so
      // every engenty call it made came back `apps.operationNotDeclared`. It
      // does not learn otherwise on its own — refetch the frontend and let the
      // view remount the frame, so the App works the moment it is activated.
      void queryClient.invalidateQueries({
        queryKey: appFrontendQueryKey(params.appId, params.version),
      });
    },
  });
}
