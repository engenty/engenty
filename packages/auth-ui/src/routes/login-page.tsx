import { useNavigate } from "react-router-dom";
import { AuthCard } from "../components/auth-card";
import { AuthLoginLayout } from "../components/auth-login-layout";
import { AuthScreenLayout } from "../components/auth-screen-layout";
import { useInitialSetupGateCheck } from "../hooks/use-initial-setup-gate-check";

export function LoginPage() {
  const navigate = useNavigate();
  const { checking, redirected } = useInitialSetupGateCheck({
    redirectWhenSetupRequired: true,
  });

  if (checking || redirected) {
    return <AuthScreenLayout message="Checking..." />;
  }

  return (
    <AuthLoginLayout>
      <AuthCard onAuthenticated={() => navigate("/")} />
    </AuthLoginLayout>
  );
}
