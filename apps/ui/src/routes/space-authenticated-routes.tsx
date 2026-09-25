import { NotificationsPage } from "@engenty/notifications-ui";
import type { ReactNode } from "react";
import { Route } from "react-router-dom";
import {
  SPACE_WORKFLOW_ROUTE_PATTERN,
  SPACE_WORKFLOW_RUN_ROUTE_PATTERN,
} from "@/lib/space-routes";
import { CopilotDeskPage } from "@/pages/CopilotDeskPage";
import { SpaceAgentDeskPage } from "@/pages/SpaceAgentDeskPage";
import { SpaceAgentHirePage } from "@/pages/SpaceAgentHirePage";
import { SpaceAgentsPage } from "@/pages/SpaceAgentsPage";
import { SpaceChatsPage } from "@/pages/SpaceChatsPage";
import { SpaceDataPage } from "@/pages/SpaceDataPage";
import { SpaceLayout } from "@/pages/SpaceLayout";
import { SpaceRoomPage } from "@/pages/SpaceRoomPage";
import { SpaceSettingsPage } from "@/pages/SpaceSettingsPage";
import { SpaceWorkflowPage } from "@/pages/SpaceWorkflowPage";
import { SpaceWorkHome } from "@/pages/SpaceWorkHome";
import { PersonalSpaceRedirect } from "@/routes/PersonalSpaceRedirect";

export function spaceAuthenticatedRoutes({
  isAdmin,
  mirroredSpaceRoutes,
}: {
  isAdmin: boolean;
  mirroredSpaceRoutes: ReactNode;
}): ReactNode {
  return (
    <>
      {/* Before the `:spaceKey` route, or `me` would be read as a key and 404
          against a space nobody has. */}
      <Route element={<PersonalSpaceRedirect />} path="/s/me/*" />
      <Route element={<PersonalSpaceRedirect />} path="/s/me" />
      <Route
        element={
          <SpaceLayout
            // The chats the layout keeps mounted between visits — the same
            // two routes declared below, which stay for matching. Absolute:
            // the layout matches them outside this route (see SpaceLayout).
            chatRoutes={
              <>
                <Route
                  element={<SpaceAgentDeskPage canManageAgents={isAdmin} />}
                  path="/s/:spaceKey/agents/:agentId"
                />
                <Route
                  element={<CopilotDeskPage />}
                  path="/s/:spaceKey/copilot"
                />
              </>
            }
            chatRoutesKey={isAdmin ? "admin" : "member"}
          />
        }
        path="/s/:spaceKey"
      >
        {/* The space root IS Work — the list of mounted modules, which lives in
            the sidebar. Nothing is selected yet, so the content area says so
            rather than redirecting into an arbitrary module. */}
        <Route element={<SpaceWorkHome />} index />
        {/* Declared before the mirrors for readability only — React Router
            ranks by specificity, and `settings` is a static segment that no
            module id can collide with (settings is a PLACEMENT, not a
            module). */}
        <Route element={<SpaceSettingsPage />} path="settings" />
        {/* The space's inbox. Reserved like `settings`: not a module, and
            the full-screen page keeps the Work sidebar with Dashboard
            selected. The dashboard bell opens the same list in a popover. */}
        <Route element={<NotificationsPage />} path="notifications" />
        {/* Static `agents` and `agents/new` before `:agentId`, or those
            segments are captured as an id. */}
        <Route element={<SpaceAgentsPage />} path="agents" />
        <Route element={<SpaceAgentHirePage />} path="agents/new" />
        <Route
          element={<SpaceAgentDeskPage canManageAgents={isAdmin} />}
          path="agents/:agentId"
        />
        {/* A room by its thread id — its own page, not a desk's engagement.
            `rooms` is a reserved segment for the same reason `chats` is. */}
        <Route
          element={<SpaceRoomPage canManageAgents={isAdmin} />}
          path="rooms/:threadId"
        />
        {/* A wizard: page 0 by workflow id (stored uuid or module id), a run
            by its run id. `workflows` is a reserved segment for the same
            reason `rooms` is. */}
        <Route
          element={<SpaceWorkflowPage />}
          path={SPACE_WORKFLOW_ROUTE_PATTERN}
        />
        <Route
          element={<SpaceWorkflowPage />}
          path={SPACE_WORKFLOW_RUN_ROUTE_PATTERN}
        />
        {/* The space's Data tree — its own page, not a module's. `data` is a
            RESERVED segment (space-module-url.ts) for the same reason
            `settings` is: without that, every reader of the URL infers a
            module called "data" and the shell hides the space's sidebar to
            show its (non-existent) nav. */}
        <Route element={<SpaceDataPage />} path="data" />
        {/* The river inside this space: the person's one conversation with
            their copilot, opened at this space's chapters, with the space's
            own column kept beside it. `copilot` is a RESERVED segment for
            the same reason `data` is. */}
        <Route element={<CopilotDeskPage />} path="copilot" />
        {/* Every conversation in the space, across its agents. Reserved for
            the same reason `data` is — it is the SPACE's view over what
            several modules produced, and a module called "chats" would take
            the space's own sidebar away to show its nav. */}
        <Route element={<SpaceChatsPage />} path="chats" />
        {mirroredSpaceRoutes}
      </Route>
    </>
  );
}
