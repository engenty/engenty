import { buildNavigationSections } from "@engenty/app-shell/navigation";
import {
  ensureCurrentWorkspaceUser,
  getSupabaseAuthClient,
  type InitialSetupGateFailure,
  isEngentyServiceAvailabilityError,
} from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDeveloperModeEnabled } from "@/hooks/use-developer-mode-enabled";
import { getFeatureFlagsResolved } from "@/lib/api/client";
import { useWorkspaceContextQuery } from "@/lib/workspace-context-query";
import type { UiContributions } from "@/plugins";
import { useUiPluginContributions } from "@/plugins";

function extractNamespacesFromContributions(contributions: {
  adminMenuItems: { labelKey?: string }[];
  settingsItems: { labelKey?: string }[];
}): string[] {
  const namespaces = new Set<string>();
  for (const item of [
    ...contributions.adminMenuItems,
    ...contributions.settingsItems,
  ]) {
    const key = item.labelKey;
    if (key?.includes(":")) {
      const ns = key.split(":")[0];
      if (ns) {
        namespaces.add(ns);
      }
    }
  }
  return Array.from(namespaces);
}

function isStaleSupabaseSessionError(message: string): boolean {
  return (
    // A refresh token Supabase has already rotated away or never had.
    /invalid refresh token/i.test(message) ||
    message.includes("refresh_token_already_used") ||
    message.includes("refresh_token_not_found") ||
    message.includes("session_not_found") ||
    message.includes("Session from session_id claim in JWT does not exist") ||
    message.includes("Auth session missing") ||
    (message.includes("sub claim") && message.includes("does not exist")) ||
    message.includes("User from sub claim")
  );
}

export function useAuthenticatedAppBootstrap(isAuthenticated: boolean) {
  const { t, i18n } = useTranslation("common");
  const tRef = useRef(t);
  tRef.current = t;

  const [onboardingReady, setOnboardingReady] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [serviceAvailabilityFailure, setServiceAvailabilityFailure] =
    useState<InitialSetupGateFailure | null>(null);

  const workspaceQuery = useWorkspaceContextQuery(
    isAuthenticated && onboardingReady
  );
  const workspaceContext = workspaceQuery.data ?? null;

  // Resolve UI plugins only after we know the tenant so /api/plugins?tenantId=… matches
  // tenant activation. An early fetch with tenantId=null can skip contacts while a second
  // fetch enables them; module-level plugin refs would update but React memos could stay stale.
  const contributionsQueryEnabled =
    isAuthenticated && onboardingReady && workspaceContext !== null;

  const { contributions, ready: pluginsReady } = useUiPluginContributions({
    enabled: contributionsQueryEnabled,
    tenantId: workspaceContext?.currentTenant?.id ?? null,
  });

  const [moduleNamespacesLoaded, setModuleNamespacesLoaded] = useState(false);
  const developerModeEnabled = useDeveloperModeEnabled();

  useEffect(() => {
    // While plugin contributions are still fetching, `contributions` is empty. Treating that as
    // "no namespaces" used to mark i18n ready immediately; `useTranslation("ai-ui")` could then load
    // the namespace before registrars ran, caching an empty bundle so keys like
    // plugin UI strings rendered literally until reload.
    if (contributionsQueryEnabled && !pluginsReady) {
      queueMicrotask(() => setModuleNamespacesLoaded(false));
      return;
    }
    const namespaces = extractNamespacesFromContributions(contributions);
    if (namespaces.length === 0) {
      queueMicrotask(() => setModuleNamespacesLoaded(true));
      return;
    }
    queueMicrotask(() => setModuleNamespacesLoaded(false));
    void i18n.loadNamespaces(namespaces).finally(() => {
      setModuleNamespacesLoaded(true);
    });
  }, [contributions, contributionsQueryEnabled, i18n, pluginsReady]);

  const sections = useMemo(() => {
    void moduleNamespacesLoaded; // re-run when namespaces load so t() resolves module labelKeys
    return buildNavigationSections(
      contributions as UiContributions,
      {
        canSwitchTenant: workspaceContext?.canSwitchTenant === true,
        developerModeEnabled,
        isSuperAdmin: workspaceContext?.isSuperAdmin === true,
        isTenantAdmin: workspaceContext?.isTenantAdmin === true,
      },
      t
    );
  }, [
    contributions,
    developerModeEnabled,
    t,
    workspaceContext,
    moduleNamespacesLoaded,
  ]);

  const fetchResolvedFeatureFlags = useCallback(
    () => getFeatureFlagsResolved().then((r) => r.resolved),
    []
  );

  useEffect(() => {
    let mounted = true;
    if (!isAuthenticated) {
      queueMicrotask(() => {
        setOnboardingReady(false);
        setOnboardingError(null);
        setServiceAvailabilityFailure(null);
      });
      return;
    }
    queueMicrotask(() => {
      setOnboardingReady(false);
      setOnboardingError(null);
      setServiceAvailabilityFailure(null);
    });
    const supabase = getSupabaseAuthClient();
    ensureCurrentWorkspaceUser(supabase)
      .then(() => {
        if (mounted) {
          setOnboardingReady(true);
        }
      })
      .catch(async (ensureError) => {
        if (!mounted) {
          return;
        }
        const msg =
          ensureError instanceof Error
            ? ensureError.message
            : String(ensureError);
        if (isStaleSupabaseSessionError(msg)) {
          await supabase.auth.signOut({ scope: "local" });
          return;
        }
        // 401 / unauthorized from ensure-current-user means the JWT is dead —
        // bounce to login instead of a dead-end setup card with `{}`.
        if (
          /unauthorized|not authenticated|401/i.test(msg) ||
          msg.trim() === "{}" ||
          msg.trim() === "[object Object]"
        ) {
          await supabase.auth.signOut({ scope: "local" });
          return;
        }
        if (isEngentyServiceAvailabilityError(ensureError)) {
          setServiceAvailabilityFailure(ensureError.failure);
          return;
        }
        setOnboardingError(msg || tRef.current("shell.onboardingFailed"));
      });
    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  return {
    onboardingReady,
    onboardingError,
    serviceAvailabilityFailure,
    workspaceQuery,
    workspaceContext,
    contributions,
    pluginsReady,
    sections,
    fetchResolvedFeatureFlags,
  };
}
