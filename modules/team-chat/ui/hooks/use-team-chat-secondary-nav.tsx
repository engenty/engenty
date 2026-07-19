import {
  ModuleSidebarHeaderLabel,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { MessagesSquare } from "lucide-react";
import { useMemo } from "react";
import { TeamChatSidebarPanel } from "../components/team-chat-sidebar-panel.js";

/** Unified sidebar panel for any `/mdl/team-chat/*` screen. */
export function useTeamChatSecondaryNav() {
  const { t, i18n, ready } = useTranslation("team-chat");
  const { secondaryNavOpen } = useShellSecondaryNav();

  // Re-memoized on locale change only (mirrors the inbox module hook).
  const secondaryNavAfterItems = useMemo(
    () => <TeamChatSidebarPanel />,
    [ready, i18n.language]
  );

  const secondaryNavHeaderSlot = useMemo(
    () => (
      <ModuleSidebarHeaderLabel
        icon={MessagesSquare}
        label={t("title")}
        to="/mdl/team-chat"
      />
    ),
    [t, ready, i18n.language]
  );

  const moduleRootCrumb = useMemo<PageBreadcrumb | null>(
    () =>
      secondaryNavOpen ? null : { label: t("title"), to: "/mdl/team-chat" },
    [secondaryNavOpen, t]
  );

  return { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot };
}
