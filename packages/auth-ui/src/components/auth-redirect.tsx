import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  evaluateInitialSetupGate,
  gateFailureToNavigationState,
  type ServiceUnavailableNavigationState,
} from "../lib/initial-setup-gate";
import { rememberReturnPath } from "../lib/return-path";

type AuthRedirectNav =
  | { to: "/initial_setup" | "/auth/login" }
  | {
      to: "/service_unavailable";
      state: ServiceUnavailableNavigationState;
    };

export function AuthRedirect() {
  const [target, setTarget] = useState<AuthRedirectNav | null>(null);
  const location = useLocation();
  const intended = `${location.pathname}${location.search}${location.hash}`;

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
      if (!gate.initial_setup_required) {
        // The link this visitor followed opens once they are signed in.
        rememberReturnPath(intended);
      }
      setTarget({
        to: gate.initial_setup_required ? "/initial_setup" : "/auth/login",
      });
    });
    return () => {
      mounted = false;
    };
  }, [intended]);

  if (target === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (target.to === "/service_unavailable") {
    return <Navigate replace state={target.state} to="/service_unavailable" />;
  }

  return <Navigate replace to={target.to} />;
}
