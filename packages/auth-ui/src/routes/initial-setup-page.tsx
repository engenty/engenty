import { useNavigate } from "react-router-dom";
import { AuthScreenLayout } from "../components/auth-screen-layout";
import { useInitialSetupGateCheck } from "../hooks/use-initial-setup-gate-check";
import { InitialSetupWizard } from "./initial-setup-wizard";

export function InitialSetupPage() {
  const navigate = useNavigate();
  const { checking, gate, redirected } = useInitialSetupGateCheck({
    redirectWhenSetupComplete: true,
  });

  if (checking || redirected || !gate?.initial_setup_required) {
    return <AuthScreenLayout message="Checking..." />;
  }

  return <InitialSetupWizard onComplete={(path) => navigate(path)} />;
}
