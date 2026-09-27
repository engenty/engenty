"use client";

// A skill as the person using it reads it: what it is for, which tools it
// reaches for, and the playbook itself. Read-only — changing a skill is the
// admin skill page's job.

import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@engenty/ui-core";
import { MessageResponse } from "../../components/presentation.js";
import { useAiSkillDetailQuery } from "../../lib/admin/ai-runtime-queries.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname.js";

export interface SkillInspectDialogProps {
  /** The skill to show; null closes the dialog. */
  name: string | null;
  onOpenChange: (open: boolean) => void;
  /** Where the skill comes from, as the list around it names it. */
  origin?: string | null;
}

export function SkillInspectDialog({
  name,
  onOpenChange,
  origin,
}: SkillInspectDialogProps) {
  const { t } = useTranslation("ai-ui");
  const detail = useAiSkillDetailQuery(name);
  const skill = detail.data?.skill ?? null;
  const body = skill?.body_markdown?.trim() ?? "";

  return (
    <Dialog onOpenChange={onOpenChange} open={name !== null}>
      <DialogContent className="grid max-h-[min(85vh,44rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-2xl">
        <DialogHeader>
          {origin ? (
            <p className="text-muted-foreground text-xs">{origin}</p>
          ) : null}
          <DialogTitle>{skill?.title?.trim() || name}</DialogTitle>
          <DialogDescription>{skill?.description ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">
          {detail.isPending ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Spinner className="size-4" />
            </div>
          ) : detail.isError ? (
            <p className="text-destructive text-sm">
              {t("skillInspect.loadFailed")}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {skill && skill.allowed_tools.length > 0 ? (
                <section className="flex flex-col gap-1.5">
                  <h3 className="font-medium text-muted-foreground text-xs">
                    {t("skillInspect.tools")}
                  </h3>
                  <ul className="flex flex-wrap gap-1">
                    {skill.allowed_tools.map((tool) => (
                      <li
                        className="rounded-[6px] bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        key={tool}
                      >
                        {tool}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {body ? (
                <MessageResponse
                  className={cn(COMPACT_MARKDOWN_PROSE_CLASSNAME, "text-sm")}
                >
                  {body}
                </MessageResponse>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t("skillInspect.empty")}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
