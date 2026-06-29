import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  evaluateInitialSetupGate,
  gateFailureToNavigationState,
  type ServiceUnavailableNavigationState,
} from "../lib/initial-setup-gate";

type AuthRedirectNav =
  | { to: "/initial_setup" | "/auth/login" }
  | {
      to: "/service_unavailable";
      state: ServiceUnavailableNavigationState;
    };

export function AuthRedirect() {
  const [target, setTarget] = useState<AuthRedirectNav | null>(null);

  useEffect(() => {
    let mounted = true;
    evaluateInitialSetupGate().then((gate) => {
      if (!mounted) {
        return;
      }
      if (gate.status !== "ready") {
        setTarget({
          to: "/service_unavailable",
          state: gateFailureToNavigationState(gate),
        });
        return;
      }
      setTarget({
        to: gate.initial_setup_required ? "/initial_setup" : "/auth/login",
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (target === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (target.to === "/service_unavailable") {
    return <Navigate replace state={target.state} to="/service_unavailable" />;
  }

  return <Navigate replace to={target.to} />;
}
