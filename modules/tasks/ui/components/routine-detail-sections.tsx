// Read-only detail sections: instructions, executing agent, runs, workspace,
// plus the editable "Approved tools" list (operations the routine may run
// without asking for approval).
import {
  type RoutineDto,
  useUpdateCustomRoutineMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input } from "@engenty/ui-core";
import { ExternalLink, Plus, ShieldCheck, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { RoutineMemorySection } from "./routine-memory-section.js";
import { RoutineRunsSection } from "./routine-runs-section.js";
import { RoutineWorkspaceStrip } from "./routine-workspace-strip.js";

function RoutineApprovedToolsSection({ routine }: { routine: RoutineDto }) {
  const { t } = useTranslation("tasks");
  const updateMutation = useUpdateCustomRoutineMutation();
  const [draft, setDraft] = useState("");
  const grants = routine.approval_grants ?? [];

  const save = (next: string[]) => {
    updateMutation.mutate({ body: { approval_grants: next }, id: routine.id });
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    const op = draft.trim();
    if (op && !grants.includes(op)) {
      save([...grants, op]);
    }
    setDraft("");
  };
  const remove = (op: string) => save(grants.filter((g: string) => g !== op));

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("routines.detail.approvedTools")}
      </h4>
      <p className="text-muted-foreground text-xs leading-normal">
        {t("routines.detail.approvedToolsHint")}
      </p>
      {grants.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {grants.map((op: string) => (
            <li
              className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
              key={op}
            >
              <code>{op}</code>
              <Button
                aria-label={t("detail.removeApprovedTool")}
                className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive"
                disabled={updateMutation.isPending}
                onClick={() => remove(op)}
                size="icon"
                variant="ghost"
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="flex items-center gap-1.5" onSubmit={add}>
        <Input
          className="h-8 font-mono text-xs"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("routines.detail.addApprovedTool")}
          value={draft}
        />
        <Button
          disabled={updateMutation.isPending || draft.trim().length === 0}
          size="icon"
          type="submit"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export function RoutineDetailSections({ routine }: { routine: RoutineDto }) {
  const { t } = useTranslation("tasks");

  return (
    <>
      {routine.prompt && (
        <div className="space-y-2">
          <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            {t("routines.detail.instructions")}
          </h4>
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3.5 font-mono text-foreground text-xs leading-relaxed">
            {routine.prompt}
          </div>
        </div>
      )}

      {routine.agent_id && (
        <div className="space-y-2">
          <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            {t("routines.detail.agent")}
          </h4>
          <div className="ui-canvas-panel flex items-center justify-between rounded-lg bg-card p-3 text-sm">
            <span className="min-w-0 font-medium font-mono text-foreground">
              {routine.agent_id}
            </span>
            <Link
              className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
              to={`/admin/engenty/${encodeURIComponent(routine.agent_id)}`}
            >
              {t("routines.detail.manageAgent")}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <p className="text-muted-foreground text-xs leading-normal">
            {t("routines.detail.agentHint", { agentId: routine.agent_id })}
          </p>
        </div>
      )}

      <RoutineApprovedToolsSection routine={routine} />

      {routine.kind === "schedule" ? (
        <>
          <RoutineRunsSection routine={routine} />
          <RoutineMemorySection triggerId={routine.id} />
          <RoutineWorkspaceStrip routine={routine} />
        </>
      ) : null}
    </>
  );
}
