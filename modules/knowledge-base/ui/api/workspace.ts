/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";

const API = "/api/kb";

/* ── Workspace (tenant locales, etc.) ── */

export interface WorkspaceSetupContextPayload {
  onboarded: boolean;
  resolvedAppearance: { language: string };
  tenantSupportedLocales: string[];
}

export async function getWorkspaceSetupContext(
  signal?: AbortSignal
): Promise<WorkspaceSetupContextPayload> {
  const data = await requestApiJson<WorkspaceSetupContextPayload>(
    "/api/users/setup/context",
    { method: "GET", signal }
  );
  return {
    onboarded: data.onboarded,
    resolvedAppearance: data.resolvedAppearance ?? { language: "en" },
    tenantSupportedLocales:
      Array.isArray(data.tenantSupportedLocales) &&
      data.tenantSupportedLocales.length > 0
        ? data.tenantSupportedLocales
        : ["en", "de"],
  };
}
