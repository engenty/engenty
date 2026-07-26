// Read-only detail sections: instructions, executing agent, runs, workspace,
// plus the editable "Approved tools" list (operations the routine may run
// without asking for approval).
import { ENGENTY_COPILOT_HOST_KEY, WorkPanel } from "@engenty/ai-ui";
import {
  MessageResponse,
  type RoutineDto,
  useUpdateCustomRoutineMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { ApprovedToolsPicker } from "./approved-tools-picker.js";
import { RoutineMemorySection } from "./routine-memory-section.js";
import { RoutineRunsSection } from "./routine-runs-section.js";

const INSTRUCTIONS_MARKDOWN_CLASSNAME = [
  "prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed",
  "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5",
  "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
  "[&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-base [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-[0.9375rem]",
  "[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2.5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:my-2 [&_hr]:my-3",
].join(" ");

function RoutineApprovedToolsSection({ routine }: { routine: RoutineDto }) {
  const { t } = useTranslation("tasks");
  const updateMutation = useUpdateCustomRoutineMutation();
  const grants = routine.approval_grants ?? [];

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("routines.detail.approvedTools")}
      </h4>
      <p className="text-muted-foreground text-xs leading-normal">
        {t("routines.detail.approvedToolsHint")}
      </p>
      <div className="ui-canvas-panel rounded-lg bg-card p-3">
        <ApprovedToolsPicker
          disabled={updateMutation.isPending}
          onChange={(next) =>
            updateMutation.mutate({
              body: { approval_grants: next },
              id: routine.id,
            })
          }
          value={grants}
        />
      </div>
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
          <div className="ui-canvas-panel max-h-72 overflow-y-auto rounded-lg bg-card p-3.5">
            <MessageResponse className={INSTRUCTIONS_MARKDOWN_CLASSNAME}>
              {routine.prompt}
            </MessageResponse>
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
          {/* Artifacts + workspace files across this routine's task
              generations and their run threads (Phase 2 container). The Files
              tab replaces the old workspace-path strip. */}
          <WorkPanel
            container={{ id: routine.id, tier: "routine" }}
            hostKey={ENGENTY_COPILOT_HOST_KEY}
            mountPane={false}
          />
        </>
      ) : null}
    </>
  );
}
