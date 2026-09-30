import { Navigate, useNavigate } from "react-router-dom";
import { AuthScreenLayout } from "../components/auth-screen-layout";
import { useCoreAuthSession } from "../lib/auth-session";
import { LIVE_TENANT_SETUP_API } from "../lib/tenant-setup-api";
import { TENANT_SETUP_PATH } from "./tenant-setup-path";
import { TenantSetupWizard } from "./tenant-setup-wizard";

/** The tenant setup for the signed-in person; signed out, it asks to sign in first. */
export function TenantSetupPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useCoreAuthSession();

  if (loading) {
    return <AuthScreenLayout message="Checking..." />;
  }
  if (!isAuthenticated) {
    return (
      <Navigate
        replace
        to={`/auth/login?redirect=${encodeURIComponent(TENANT_SETUP_PATH)}`}
      />
    );
  }
  return (
    <TenantSetupWizard
      api={LIVE_TENANT_SETUP_API}
      onComplete={(path) => navigate(path)}
    />
  );
}
