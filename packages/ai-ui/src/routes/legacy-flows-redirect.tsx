// `/admin/engenty/flows` was the catalog URL before the rename to
// `/admin/engenty/workflows`. The old segment is not a registered page, so
// it used to hit the app catch-all and dump the person on Copilot chat.
import { Navigate, useLocation, useParams } from "react-router-dom";
import {
  buildWorkflowDetailPath,
  WORKFLOWS_CATALOG_ROOT_PATH,
} from "../features/agents-workspace/agent-workspace-paths.js";

export function LegacyFlowsRedirect() {
  const { workflowId } = useParams<{ workflowId?: string }>();
  const { hash, search } = useLocation();
  const to = workflowId
    ? buildWorkflowDetailPath(workflowId)
    : WORKFLOWS_CATALOG_ROOT_PATH;
  return <Navigate replace to={`${to}${search}${hash}`} />;
}
