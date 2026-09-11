import { Button } from "@engenty/ui-core";
import { Link } from "react-router-dom";
import type { ProjectsBriefingResponse } from "../../api.js";

export function BriefingSuggestedActions({
  actions,
  t,
}: {
  actions: ProjectsBriefingResponse["suggested_actions"];
  t: (key: string) => string;
}) {
  return (
    <section className="rounded-lg border border-border-soft bg-card p-4">
      <h2 className="font-medium text-sm">
        {t("briefing.sections.suggested")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) =>
          a.href ? (
            <Button asChild key={a.id} size="sm" variant="secondary">
              <Link to={a.href}>{a.label}</Link>
            </Button>
          ) : (
            <Button disabled key={a.id} size="sm" variant="secondary">
              {a.label}
            </Button>
          )
        )}
      </div>
    </section>
  );
}
