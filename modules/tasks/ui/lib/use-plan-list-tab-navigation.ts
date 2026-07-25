import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { PlanListTab } from "../components/plan-list-sub-nav.js";
import { tasksPaths } from "./tasks-routes.js";

/** Navigate between Plan list hubs when header tabs change. */
export function usePlanListTabNavigation() {
  const navigate = useNavigate();

  return useCallback(
    (value: string) => {
      const tab = value as PlanListTab;
      if (tab === "goals") {
        navigate(tasksPaths.goals);
        return;
      }
      if (tab === "routines") {
        navigate(tasksPaths.routines);
        return;
      }
      navigate(tasksPaths.list);
    },
    [navigate]
  );
}
