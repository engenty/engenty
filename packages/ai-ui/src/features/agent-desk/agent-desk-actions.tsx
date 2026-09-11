import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import {
  CalendarClock,
  Check,
  Copy,
  History,
  Lock,
  LogOut,
  MoreVertical,
  ScanSearch,
  Settings2,
  SlidersHorizontal,
  SquarePen,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArtifactPaneToggle } from "../../artifacts/workspace-artifact-pane.js";
import { useDeveloperModeEnabled } from "../../components/ag-ui-inspector/ag-ui-inspector-hooks.js";
import { openAgUiAgentInspector } from "../../components/ag-ui-inspector/ag-ui-inspector-widget.js";
import { ThreadContextToggle } from "../../components/copilot/thread-context/thread-context-toggle.js";
import {
  buildAgentCapabilitiesPath,
  buildAgentDetailPath,
  buildAgentEditPath,
} from "../agents-workspace/agent-workspace-paths.js";
import { UserBrowserPaneToggle } from "../browser/user-browser-pane.js";
import { RoutineCreateDialog } from "../routines/routine-create-dialog.js";
import type { AgentDeskPanel } from "./agent-desk-drawer.js";
import {
  AgentRemovalDialog,
  type AgentRemovalMode,
} from "./agent-removal-dialog.js";

const COPIED_RESET_MS = 1500;

export function AgentDeskActions(props: {
  agentId: string;
  agentName: string;
  canAsk: boolean;
  canAssignWork: boolean;
  canManage: boolean;
  hostKey: string;
  /** Only a custom (database-backed) agent has an edit form to open. */
  isCustomAgent: boolean;
  locale: string;
  /** A room hosted by this agent with other agents of the space in it. */
  onNewRoom?: () => void;
  /** The viewer's private line with this agent — opened on first use. */
  onOpenDm?: () => void;
  /** Opens the side drawer — Settings or Runs — over the chat. */
  onOpenPanel: (panel: AgentDeskPanel) => void;
  spaceId: string;
  spaceKey: string;
  /** The open conversation — the artifact pane lists that thread's work. */
  threadId: string | null;
}) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const developerMode = useDeveloperModeEnabled();
  const [routineOpen, setRoutineOpen] = useState(false);
  const [removal, setRemoval] = useState<AgentRemovalMode | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    },
    []
  );

  const copyAgentId = useCallback(() => {
    void navigator.clipboard?.writeText(props.agentId);
    setCopied(true);
    if (copiedTimer.current !== null) {
      window.clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = window.setTimeout(
      () => setCopied(false),
      COPIED_RESET_MS
    );
  }, [props.agentId]);

  // Settings and the artifact pane are the two things you reach for WHILE
  // working with an agent, so they are buttons; everything else stays in the
  // overflow menu, which closes the row on the right the way it does on every
  // other page. The desk is one long conversation with this agent; a private
  // word with it is the DM, and a job with members is a room — both in the
  // menu, neither a reset of the desk.
  return (
    <div className="flex items-center gap-0.5">
      <Button
        aria-label={t("agentDesk.actions.settings")}
        className={cn(
          topbarIconButtonClassName,
          // Square hit-target: the contentBlend topbar forces `!px-2` on
          // buttons, which leaves a wide empty gap on an icon-only one.
          "!size-7 !w-7 !min-w-7 !px-0"
        )}
        onClick={() => props.onOpenPanel("manage")}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Settings2 className="size-4" />
      </Button>
      <ThreadContextToggle hostKey={props.hostKey} />
      {/* The person's browser beside the chat — its state, and the live
          view with takeover while it runs (PLAN-user-browser.md §2.6). */}
      <UserBrowserPaneToggle />
      {/* The agent's own artefacts: the pane opens from here, and opens
          itself when the agent shows one it is working on. */}
      <ArtifactPaneToggle
        extraScope={{ id: props.agentId, type: "agent" }}
        hostKey={props.hostKey}
        scope={{ id: props.threadId, type: "thread" }}
      />
      {/* TBD: Assign work (create a task for this agent) is disabled. The
          button — like everything task-shaped on the desk — must be
          contributed by the TASKS MODULE via a UI hook, not hardcoded here;
          `canAssignWork` (tasks module mounted) stays on the wire for that
          rewiring. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("agentDesk.actions.menuLabel")}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {props.canAsk && (props.onOpenDm || props.onNewRoom) ? (
            <>
              {props.onOpenDm ? (
                <DropdownMenuItem onSelect={props.onOpenDm}>
                  <Lock className="mr-2 size-4" />
                  {t("agentDesk.actions.openDm")}
                </DropdownMenuItem>
              ) : null}
              {props.onNewRoom ? (
                <DropdownMenuItem onSelect={props.onNewRoom}>
                  <Users className="mr-2 size-4" />
                  {t("agentDesk.actions.newRoom")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => props.onOpenPanel("runs")}>
            <History className="mr-2 size-4" />
            {t("agentDesk.actions.runs")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {props.canAssignWork ? (
            <DropdownMenuItem onSelect={() => setRoutineOpen(true)}>
              <CalendarClock className="mr-2 size-4" />
              {t("agentDesk.actions.addRoutine")}
            </DropdownMenuItem>
          ) : null}
          {/* Stays open after the click: ai-ui has no toaster, so the item's
              own "Copied" state is the only confirmation there is. */}
          <DropdownMenuItem closeOnClick={false} onSelect={copyAgentId}>
            {copied ? (
              <Check className="mr-2 size-4" />
            ) : (
              <Copy className="mr-2 size-4" />
            )}
            {copied
              ? t("agentDesk.actions.copiedId")
              : t("agentDesk.actions.copyId")}
          </DropdownMenuItem>
          {developerMode ? (
            <DropdownMenuItem onSelect={() => openAgUiAgentInspector()}>
              <ScanSearch className="mr-2 size-4" />
              {t("agentDesk.actions.openInspector")}
            </DropdownMenuItem>
          ) : null}
          {props.canManage ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => navigate(buildAgentDetailPath(props.agentId))}
              >
                <SlidersHorizontal className="mr-2 size-4" />
                {t("agentDesk.actions.manageAgent")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  navigate(buildAgentCapabilitiesPath(props.agentId))
                }
              >
                <Wrench className="mr-2 size-4" />
                {t("agentDesk.actions.capabilities")}
              </DropdownMenuItem>
              {props.isCustomAgent ? (
                <DropdownMenuItem
                  onSelect={() => navigate(buildAgentEditPath(props.agentId))}
                >
                  <SquarePen className="mr-2 size-4" />
                  {t("agentDesk.actions.editAgent")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setRemoval("unmount")}>
                <LogOut className="mr-2 size-4" />
                {t("agentDesk.actions.removeFromSpace")}
              </DropdownMenuItem>
              {props.isCustomAgent ? (
                <DropdownMenuItem
                  onSelect={() => setRemoval("delete")}
                  variant="destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  {t("agentDesk.actions.deleteAgent")}
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {removal ? (
        <AgentRemovalDialog
          agentId={props.agentId}
          agentName={props.agentName}
          mode={removal}
          onOpenChange={(next) => {
            if (!next) {
              setRemoval(null);
            }
          }}
          open
          spaceId={props.spaceId}
          spaceKey={props.spaceKey}
        />
      ) : null}
      {/* Mounted only while open: the dialog runs routine mutations, and the
          action row lives in the topbar. */}
      {routineOpen ? (
        <RoutineCreateDialog
          defaultAgentId={props.agentId}
          locale={props.locale}
          onOpenChange={setRoutineOpen}
          open
        />
      ) : null}
    </div>
  );
}
