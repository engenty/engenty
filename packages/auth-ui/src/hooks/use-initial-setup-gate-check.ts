import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  evaluateInitialSetupGate,
  gateFailureToNavigationState,
  type InitialSetupGateReady,
} from "../lib/initial-setup-gate";

type GateCheckPhase = "checking" | "ready" | "redirected";

interface UseInitialSetupGateCheckOptions {
  /** When true, navigate to `/auth/login` if setup is already complete (initial setup page). */
  redirectWhenSetupComplete?: boolean;
  /** When true, navigate to `/initial_setup` if setup is required (login page). */
  redirectWhenSetupRequired?: boolean;
}

/**
 * Loads workspace setup gate once; sends failures to `/service_unavailable`.
 * Returns `ready` gate payload when the page should render its main UI.
 */
export function useInitialSetupGateCheck(
  options: UseInitialSetupGateCheckOptions = {}
) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<GateCheckPhase>("checking");
  const [gate, setGate] = useState<InitialSetupGateReady | null>(null);

  useEffect(() => {
    let mounted = true;
    evaluateInitialSetupGate()
      .then((result) => {
        if (!mounted) {
          return;
        }
        if (result.status !== "ready") {
          navigate("/service_unavailable", {
            replace: true,
            state: gateFailureToNavigationState(result),
          });
          setPhase("redirected");
          return;
        }
        if (
          options.redirectWhenSetupRequired &&
          result.initial_setup_required
        ) {
          navigate("/initial_setup", { replace: true });
          setPhase("redirected");
          return;
        }
        if (
          options.redirectWhenSetupComplete &&
          !result.initial_setup_required
        ) {
          navigate("/auth/login", { replace: true });
          setPhase("redirected");
          return;
        }
        setGate(result);
        setPhase("ready");
      })
      .catch(() => {
        if (mounted) {
          setPhase("redirected");
        }
      });
    return () => {
      mounted = false;
    };
  }, [
    navigate,
    options.redirectWhenSetupComplete,
    options.redirectWhenSetupRequired,
  ]);

  return {
    checking: phase === "checking",
    gate,
    redirected: phase === "redirected",
  };
}
