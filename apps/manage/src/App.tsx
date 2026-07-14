import {
  AppLayout,
  COPILOT_LAYOUT_NOOP,
  CopilotShellProvider,
} from "@engenty/app-shell";
import { getSupabaseAuthClient, useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { CenteredMessage } from "@/components/CenteredMessage";
import { SidebarUserMenu } from "@/components/shell/SidebarUserMenu";
import { useManageSections } from "@/components/shell/sections";
import { workspaceContextQuery } from "@/lib/queries/workspace";
import { ManageRoutes } from "@/routes";
import { UnauthenticatedRoutes } from "@/routes/UnauthenticatedRoutes";

/**
 * True when an API error means the stored session is no longer valid (a 401, or
 * GoTrue reporting the JWT's session is gone after a server restart). Such a
 * token can never recover, so the app should sign out rather than show a
 * dead-end error card.
 */
function isSessionExpired(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if ((error as { status?: number }).status === 401) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("session") || message.includes("jwt");
}

function AuthenticatedApp() {
  const { t } = useTranslation("common");
  const sections = useManageSections();
  const workspaceQuery = useQuery(workspaceContextQuery);
  const sessionExpired = isSessionExpired(workspaceQuery.error);

  // A stale/invalid token can't recover: clear it locally so the login screen
  // shows. `onAuthStateChange` flips `isAuthenticated` -> false in App.
  useEffect(() => {
    if (sessionExpired) {
      try {
        void getSupabaseAuthClient().auth.signOut({ scope: "local" });
      } catch {
        // ignore — worst case the message card below still shows.
      }
    }
  }, [sessionExpired]);

  // `isPending` (not `isLoading`) so a paused/reconnecting fetch — which has no
  // data and no error yet — shows loading rather than falling through to the
  // "could not load" card below. That card is only for a settled failure.
  if (workspaceQuery.isPending || sessionExpired) {
    return <CenteredMessage title={t("shell.loading")} />;
  }

  if (workspaceQuery.error || !workspaceQuery.data) {
    const message =
      workspaceQuery.error instanceof Error
        ? workspaceQuery.error.message
        : t("shell.loadFailed");
    return (
      <CenteredMessage body={message} title={t("shell.authSetupRequired")} />
    );
  }

  const workspace = workspaceQuery.data;

  if (!workspace.isSuperAdmin) {
    return (
      <CenteredMessage
        body={t("shell.accessDenied.body")}
        title={t("shell.accessDenied.title")}
      />
    );
  }

  const displayName =
    workspace.currentUser.display_name ?? workspace.currentUser.email ?? "";
  const email = workspace.currentUser.email ?? "";
  const initials =
    workspace.currentUser.initials ??
    displayName.slice(0, 2).toUpperCase() ??
    "";

  return (
    // Manage has no copilot; provide the shell context the layout requires with
    // a no-op layout persistence and the dock kept closed (defaultDockMode null).
    <CopilotShellProvider
      copilotLayout={COPILOT_LAYOUT_NOOP}
      defaultDockMode={null}
    >
      <AppLayout
        defaultTopbarTitle={t("navigation.tenants")}
        fetchResolvedFeatureFlags={async () => ({})}
        sections={sections}
        shell={{
          appTitle: t("sidebar.brand"),
          appSubtitle: t("sidebar.subtitle"),
          searchPlaceholder: t("sidebar.search"),
          userMenu: (compact) => (
            <SidebarUserMenu
              compact={compact}
              displayName={displayName}
              email={email}
              initials={initials}
            />
          ),
        }}
      >
        <ManageRoutes />
      </AppLayout>
    </CopilotShellProvider>
  );
}

function App() {
  const { t } = useTranslation("common");
  const { isAuthenticated, loading, error } = useCoreAuthSession();

  if (loading) {
    return <CenteredMessage title={t("shell.loading")} />;
  }

  if (error) {
    return (
      <CenteredMessage body={error} title={t("shell.authSetupRequired")} />
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <UnauthenticatedRoutes />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  return (
    <>
      <AuthenticatedApp />
      <Toaster position="bottom-right" richColors />
    </>
  );
}

export default App;
