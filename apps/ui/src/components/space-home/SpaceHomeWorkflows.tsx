/**
 * The home's right column: the wizards this space can run.
 *
 * A wizard is a published workflow whose steps are walked one page at a
 * time; each row opens its page 0. This is a query against existing state —
 * the workflow rows — so the home composes nothing new.
 */
import {
  listWorkflows,
  spaceWorkflowPath,
  type WorkflowDto,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";

/** The rows the card lists: published wizards, in catalog order. */
export function selectSpaceHomeWorkflows(
  graphs: readonly WorkflowDto[]
): WorkflowDto[] {
  return graphs.filter(
    (graph) => graph.surface === "wizard" && graph.status === "active"
  );
}

export function SpaceHomeWorkflows({ spaceKey }: { spaceKey: string }) {
  const { t } = useTranslation("common");
  const query = useQuery({
    queryFn: ({ signal }) => listWorkflows({ surface: "wizard" }, signal),
    queryKey: ["workflows", "list", "*", "wizard"],
    staleTime: 10_000,
  });
  const rows = selectSpaceHomeWorkflows(query.data?.graphs ?? []);

  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col">
      <SpaceHomeSectionHeading>
        {t("spaces.home.workflows.title", { defaultValue: "Workflows" })}
      </SpaceHomeSectionHeading>
      <div className="ui-card-raised flex flex-col rounded-[14px] px-1.5 py-1">
        {rows.map((workflow) => (
          <Link
            className="flex items-start gap-2.5 rounded-[10px] px-2 py-2 hover:bg-accent/60"
            key={workflow.id}
            to={spaceWorkflowPath(spaceKey, workflow.id)}
          >
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-muted text-muted-foreground">
              <ListChecks className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[13px]">
                {workflow.title?.trim() || workflow.name}
              </span>
              {workflow.description?.trim() ? (
                <span className="mt-0.5 line-clamp-2 block text-[11.5px] text-muted-foreground">
                  {workflow.description}
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
