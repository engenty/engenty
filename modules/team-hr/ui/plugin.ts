import {
  registerTeamMemberDetailTab,
  TeamMemberDetailPage,
} from "@engenty/team/ui";
import type { EngentyPluginContext } from "@engenty/ui-plugin-sdk";
import { TeamMemberEmploymentTimeTab } from "./employment-time/team-member-employment-time-tab.js";
import { TeamMemberHrDetailPage } from "./pages/team-member-hr-detail-page.js";
import { TeamMemberHrEditPage } from "./pages/team-member-hr-edit-page.js";

export default function plugin(engenty: EngentyPluginContext) {
  // HR + employment-time tabs on the team member detail, contributed through the
  // team member-detail tab seam. Gated on the team.hr.enabled feature flag.
  registerTeamMemberDetailTab({
    id: "hr",
    labelKey: "detail.tabs.hr",
    labelDefault: "HR",
    order: 2,
    urlSuffix: "hr",
    isVisible: ({ featureFlags }) => featureFlags?.["team.hr.enabled"] === true,
  });
  registerTeamMemberDetailTab({
    id: "time",
    labelKey: "detail.tabs.time",
    labelDefault: "Time & Absences",
    order: 3,
    urlSuffix: "time",
    content: TeamMemberEmploymentTimeTab,
    isVisible: ({ featureFlags }) => featureFlags?.["team.hr.enabled"] === true,
  });

  // The HR detail/edit pages own standalone routes; the time tab renders inside
  // team's shared TeamMemberDetailPage via the registered tab content.
  engenty.UI.registerRoute({
    id: "team_module_hr_detail",
    path: "/mdl/team/:id/hr",
    component: TeamMemberHrDetailPage,
    order: 122,
  });
  engenty.UI.registerRoute({
    id: "team_module_detail_time",
    path: "/mdl/team/:id/time",
    component: TeamMemberDetailPage,
    order: 122,
  });
  engenty.UI.registerRoute({
    id: "team_module_hr_edit",
    path: "/mdl/team/:id/hr/edit",
    component: TeamMemberHrEditPage,
    order: 123,
  });
}
