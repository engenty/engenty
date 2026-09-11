// "Remove from Space" and "Delete agent" — the same conversation, twice.
//
// The dialog is the PREVIEW: it names what is attached and asks where the
// work should go. The cascade itself is one server call — core's
// `DELETE /api/spaces/:id/mounts/agent/:key?reassign_to=…` disables the
// agent's triggers, reassigns its open tasks and removes the mount, so a tab
// closed mid-removal cannot leave a half-removed specialist behind.
//
// Unmounting HIDES — that principle is core's (`space-data-routes`: "Unmounting
// HIDES records; it never deletes them"), so routines are PAUSED here, not
// deleted: re-mounting the agent brings a working setup back. Deleting the
// agent is the other case — a routine whose specialist no longer exists can
// never run again, so those are deleted with it. Either way the routines are
// found by `agent_id`: only a specialist owns a routine.

import { requestApiEnvelope, requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Label,
} from "@engenty/ui-core";
import { CalendarClock, ListTodo, Loader2, Workflow } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteCustomAgent } from "../../lib/runtime/registry-api.js";
import type { RoutineDto } from "../routines/routines-api.js";
import { useRoutinesListQuery } from "../routines/routines-queries.js";
import { useWorkflowListQuery } from "../workflow-canvas/workflow-queries.js";

/** The little of a task this preview needs — assignment, and what it is. */
interface AgentSpaceTask {
  id: string;
  identifier: string | null;
  status: string;
  title: string;
}

/** Open work assigned to this agent. `spaceId` omitted = wherever it works. */
async function listAgentTasks(
  agentId: string,
  spaceId: string | null,
  signal?: AbortSignal
): Promise<AgentSpaceTask[]> {
  const search = new URLSearchParams({
    assignee_kind: "agent",
    pageSize: "200",
    primary_assignee_agent_type_key: agentId,
  });
  if (spaceId) {
    search.set("space_id", spaceId);
  }
  const response = await requestApiEnvelope<AgentSpaceTask[], unknown>(
    `/api/tasks?${search.toString()}`,
    { signal }
  );
  return response.data ?? [];
}

/** Agent keys mounted in this Space — the candidates work can move to. */
async function listSpaceAgentKeys(
  spaceId: string,
  signal?: AbortSignal
): Promise<string[]> {
  const mounts = await requestApiJson<
    Array<{ resourceKey: string; resourceType: string }>
  >(`/api/spaces/${encodeURIComponent(spaceId)}/mounts`, { signal });
  return mounts
    .filter((mount) => mount.resourceType === "agent")
    .map((mount) => mount.resourceKey);
}

/** The one-call server-side cascade: triggers off, tasks moved, mount gone. */
function removeAgentFromSpace(
  spaceId: string,
  agentId: string,
  reassignTo: string | null
) {
  const search = reassignTo
    ? `?reassign_to=${encodeURIComponent(reassignTo)}`
    : "";
  return requestApiJson(
    `/api/spaces/${encodeURIComponent(spaceId)}/mounts/agent/${encodeURIComponent(agentId)}${search}`,
    { method: "DELETE" }
  );
}

export type AgentRemovalMode = "delete" | "unmount";

const UNASSIGN = "";

export function AgentRemovalDialog({
  agentId,
  agentName,
  mode,
  onOpenChange,
  open,
  spaceId,
  spaceKey,
}: {
  agentId: string;
  agentName: string;
  mode: AgentRemovalMode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  spaceId: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reassignTo, setReassignTo] = useState<string>(UNASSIGN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deleting the agent reaches every Space it works in; unmounting reaches one.
  const routinesQuery = useRoutinesListQuery(
    open,
    mode === "delete" ? "tenant" : "current"
  );
  const routines = useMemo(
    () =>
      (routinesQuery.data?.routines ?? []).filter(
        (routine: RoutineDto) => routine.agent_id === agentId
      ),
    [agentId, routinesQuery.data?.routines]
  );

  // The agent's own workflows are deleted with it — the preview must say so,
  // exactly like the routines line. Unmounting leaves them untouched.
  const graphsQuery = useWorkflowListQuery();
  const ownedActions = useMemo(
    () =>
      (graphsQuery.data?.graphs ?? []).filter(
        (graph) => graph.owner_agent_id === agentId
      ),
    [agentId, graphsQuery.data?.graphs]
  );

  const tasksQuery = useQuery({
    enabled: open,
    queryFn: ({ signal }) =>
      listAgentTasks(agentId, mode === "delete" ? null : spaceId, signal),
    queryKey: ["agent-removal", "tasks", agentId, mode, spaceId],
    staleTime: 0,
  });
  // Every open task assigned to this agent is a genuine work item — routines
  // are a separate record and are handled above, by agent_id alone.
  const tasks = useMemo<AgentSpaceTask[]>(
    () => tasksQuery.data ?? [],
    [tasksQuery.data]
  );

  const candidatesQuery = useQuery({
    enabled: open,
    queryFn: ({ signal }) => listSpaceAgentKeys(spaceId, signal),
    queryKey: ["agent-removal", "space-agents", spaceId],
    staleTime: 60_000,
  });
  const candidates = useMemo(
    () => (candidatesQuery.data ?? []).filter((key) => key !== agentId),
    [agentId, candidatesQuery.data]
  );

  const confirm = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await removeAgentFromSpace(
        spaceId,
        agentId,
        reassignTo === UNASSIGN ? null : reassignTo
      );
      if (mode === "delete") {
        // The registry delete cascades its own cleanup server-side (mounts in
        // every other Space, trigger disable).
        await deleteCustomAgent(agentId);
      }
      await queryClient.invalidateQueries();
      onOpenChange(false);
      navigate(`/s/${encodeURIComponent(spaceKey)}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [
    agentId,
    mode,
    navigate,
    onOpenChange,
    queryClient,
    reassignTo,
    routines,
    spaceId,
    spaceKey,
    tasks,
  ]);

  const loading = routinesQuery.isPending || tasksQuery.isPending;

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(`agentDesk.removal.${mode}.title`, { name: agentName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(`agentDesk.removal.${mode}.description`)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CalendarClock
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <span>
                {loading
                  ? t("agentDesk.removal.counting")
                  : t(`agentDesk.removal.${mode}.routines`, {
                      count: routines.length,
                    })}
              </span>
            </li>
            {mode === "delete" ? (
              <li className="flex items-start gap-2">
                <Workflow
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span>
                  {graphsQuery.isPending
                    ? t("agentDesk.removal.counting")
                    : t("agentDesk.removal.delete.actions", {
                        count: ownedActions.length,
                      })}
                </span>
              </li>
            ) : null}
            <li className="flex items-start gap-2">
              <ListTodo
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <span>
                {loading
                  ? t("agentDesk.removal.counting")
                  : t("agentDesk.removal.tasks", { count: tasks.length })}
              </span>
            </li>
          </ul>

          {tasks.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="agent-removal-reassign">
                {t("agentDesk.removal.reassignLabel")}
              </Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                disabled={busy}
                id="agent-removal-reassign"
                onChange={(event) => setReassignTo(event.target.value)}
                value={reassignTo}
              >
                <option value={UNASSIGN}>
                  {t("agentDesk.removal.reassignNobody")}
                </option>
                {candidates.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("agentDesk.removal.cancel")}
          </AlertDialogCancel>
          {/* Not AlertDialogAction: that closes the dialog on click, which would
              take the progress and any error message with it. */}
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy || loading}
            onClick={confirm}
            type="button"
          >
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {t(`agentDesk.removal.${mode}.confirm`)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
