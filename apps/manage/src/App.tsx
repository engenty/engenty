import { AppLayout } from "@engenty/app-shell";
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Toaster } from "sonner";
import { CenteredMessage } from "@/components/CenteredMessage";
import { SidebarUserMenu } from "@/components/shell/SidebarUserMenu";
import { useManageSections } from "@/components/shell/sections";
import { workspaceContextQuery } from "@/lib/queries/workspace";
import { ManageRoutes } from "@/routes";
import { UnauthenticatedRoutes } from "@/routes/UnauthenticatedRoutes";

function AuthenticatedApp() {
  const { t } = useTranslation("common");
  const sections = useManageSections();
  const workspaceQuery = useQuery(workspaceContextQuery);

  if (workspaceQuery.isLoading) {
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
