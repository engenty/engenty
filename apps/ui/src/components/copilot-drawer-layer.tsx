// Mounts the copilot companion (`<CopilotDrawer />`) beside the page with
// what only the app knows: the shell's dock refs and layout, the labels, the
// Space roster for the who chooser, and the module contribution for the page
// (its title and openers). The lane itself is the desk's, on the river
// (`AgentDeskChatPanel` inside the drawer body).
import {
  COPILOT_WHO_ID,
  CompanionWorkChat,
  type CopilotChatOnFinish,
  CopilotDrawer,
  type CopilotRouteContext,
  useCopilotAssistantTurnFinish,
} from "@engenty/ai-ui";
import type { CopilotDockMode } from "@engenty/app-shell";
import { useCopilotLayoutOrNull } from "@engenty/app-shell";
import { CopilotEffortControl } from "@engenty/engenty-copilot/ui/effort-control";
import { useTranslation } from "@engenty/i18n/ui";
import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";
import { usePageHeader } from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo } from "react";
import type { Location } from "react-router-dom";
import { CopilotApprovalModeControl } from "@/components/copilot-approval-mode-control";
import { CopilotSurfaceErrorBoundary } from "@/components/copilot-surface-error-boundary";
import { parseSpacePath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpaceRosterAgents } from "@/lib/use-space-roster-agents";

export const CLOSED_COPILOT_CONTEXT: CopilotRouteContext = {
  moduleId: "engenty-copilot",
  pathname: "/",
  routeKey: "chat",
  scope: {},
};

interface CopilotShellLike {
  copilotDockRef?: { current: HTMLDivElement | null };
  copilotLayout?: unknown;
  copilotSidebarRef?: { current: HTMLDivElement | null };
  mainContentReady?: boolean;
  mainContentRef?: { current: HTMLElement | null };
  preferredDockMode?: CopilotDockMode | null;
}

export interface CopilotDrawerLayerProps {
  contribution: UiCopilotContribution | null;
  copilotContext: CopilotRouteContext;
  dockMode: CopilotDockMode | undefined;
  location: Location;
  /** After the copilot's approved action ran on this page — its module refreshes. */
  onCopilotApplySuccess?: () => void;
  onCopilotAssistantTurnFinish?: CopilotChatOnFinish;
  open: boolean;
  setOpen: (open: boolean) => void;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  shell: CopilotShellLike | null;
}

export function CopilotDrawerLayer(props: CopilotDrawerLayerProps) {
  const { t } = useTranslation("common");
  const { topbarChrome } = usePageHeader();
  const layout = useCopilotLayoutOrNull();
  const spacePath = parseSpacePath(props.location.pathname);
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () =>
      spacesQuery.data?.find(
        (candidate) => candidate.key === spacePath?.spaceKey
      ),
    [spacePath?.spaceKey, spacesQuery.data]
  );
  const { agents: rosterAgents } = useSpaceRosterAgents(space?.id ?? null);
  const agentChooserLabels = useMemo(
    () => ({ selectAgent: t("copilot.agentChooser.selectAgent") }),
    [t]
  );
  const whoOptions = useMemo(
    () => [
      {
        engenty: "round" as const,
        id: COPILOT_WHO_ID,
        name: t("copilot.title"),
      },
      ...rosterAgents.map((agent) => ({
        ...(agent.avatarUrl ? { avatarUrl: agent.avatarUrl } : {}),
        engenty: agent.engenty,
        id: agent.id,
        name: agent.name,
      })),
    ],
    [rosterAgents, t]
  );

  // A hired Engenty of this Space, in the companion's place.
  const workPanelContent =
    props.open && layout?.companionWho.kind === "engenty" && space?.id ? (
      <CompanionWorkChat
        agentId={layout.companionWho.agentId}
        spaceId={space.id}
      />
    ) : undefined;

  const onClose = useCallback(() => {
    props.setOpen(false);
  }, [props.setOpen]);

  useCopilotAssistantTurnFinish(props.onCopilotAssistantTurnFinish);

  return (
    <CopilotSurfaceErrorBoundary
      debugContext={{
        contributionTitle: props.contribution?.title,
        dockMode: props.dockMode,
        moduleId: props.copilotContext.moduleId,
        pathname: props.location.pathname,
        routeKey: props.copilotContext.routeKey,
      }}
      onClose={onClose}
      resetKey={`${props.dockMode ?? "local"}:${String(props.open)}`}
    >
      <CopilotDrawer
        agentChooserLabels={agentChooserLabels}
        attachLabel={t("copilot.position.sidebar")}
        closeLabel={t("copilot.position.heading")}
        composerLeadingControl={
          <>
            <CopilotEffortControl />
            <CopilotApprovalModeControl />
          </>
        }
        composerPlaceholder={t("copilot.typeMessage")}
        copilotContext={props.copilotContext}
        copilotDockRef={props.shell?.copilotDockRef as never}
        copilotLayout={(props.shell?.copilotLayout ?? null) as never}
        copilotSidebarRef={props.shell?.copilotSidebarRef as never}
        dockMode={props.dockMode}
        headerChrome={topbarChrome === "band" ? "default" : "contentBlend"}
        mainContentReady={props.shell?.mainContentReady ?? false}
        mainContentRef={props.shell?.mainContentRef}
        module={props.copilotContext.moduleId}
        onOpenChange={props.setOpen}
        onSandboxApproved={props.onCopilotApplySuccess}
        open={props.open}
        positionDrawerLabel={t("copilot.position.drawer")}
        positionFullscreenLabel={t("copilot.position.fullscreen")}
        positionHeadingLabel={t("copilot.position.heading")}
        positionMenuAriaLabel={t("copilot.position.menu")}
        positionSidebarLabel={t("copilot.position.sidebar")}
        positionWindowLabel={t("copilot.position.window")}
        preferredDockMode={props.shell?.preferredDockMode ?? null}
        routeKey={props.copilotContext.routeKey}
        scope={props.copilotContext.scope ?? null}
        setPreferredDockMode={props.setPreferredDockMode}
        starterPrompts={props.contribution?.starterPrompts}
        title={props.contribution?.title ?? t("copilot.title")}
        whoOptions={whoOptions}
        workPanelContent={workPanelContent}
      />
    </CopilotSurfaceErrorBoundary>
  );
}

/** FAB / dock chrome only — no page header, space roster, or live path. */
export function CopilotClosedDrawerChrome({
  dockMode,
  setOpen,
  setPreferredDockMode,
  shell,
}: {
  dockMode: CopilotDockMode | undefined;
  setOpen: (open: boolean) => void;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  shell: CopilotShellLike | null;
}) {
  const { t } = useTranslation("common");
  const onClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return (
    <CopilotSurfaceErrorBoundary
      debugContext={{
        dockMode,
        moduleId: CLOSED_COPILOT_CONTEXT.moduleId,
        pathname: "/",
        routeKey: CLOSED_COPILOT_CONTEXT.routeKey,
      }}
      onClose={onClose}
      resetKey={`${dockMode ?? "local"}:false`}
    >
      <CopilotDrawer
        attachLabel={t("copilot.position.sidebar")}
        closeLabel={t("copilot.position.heading")}
        composerLeadingControl={
          <>
            <CopilotEffortControl />
            <CopilotApprovalModeControl />
          </>
        }
        composerPlaceholder={t("copilot.typeMessage")}
        copilotContext={CLOSED_COPILOT_CONTEXT}
        copilotDockRef={shell?.copilotDockRef as never}
        copilotLayout={(shell?.copilotLayout ?? null) as never}
        copilotSidebarRef={shell?.copilotSidebarRef as never}
        dockMode={dockMode}
        headerChrome="default"
        mainContentReady={shell?.mainContentReady ?? false}
        mainContentRef={shell?.mainContentRef}
        module={CLOSED_COPILOT_CONTEXT.moduleId}
        onOpenChange={setOpen}
        open={false}
        positionDrawerLabel={t("copilot.position.drawer")}
        positionFullscreenLabel={t("copilot.position.fullscreen")}
        positionHeadingLabel={t("copilot.position.heading")}
        positionMenuAriaLabel={t("copilot.position.menu")}
        positionSidebarLabel={t("copilot.position.sidebar")}
        positionWindowLabel={t("copilot.position.window")}
        preferredDockMode={shell?.preferredDockMode ?? null}
        routeKey={CLOSED_COPILOT_CONTEXT.routeKey}
        scope={null}
        setPreferredDockMode={setPreferredDockMode}
        title={t("copilot.title")}
      />
    </CopilotSurfaceErrorBoundary>
  );
}
