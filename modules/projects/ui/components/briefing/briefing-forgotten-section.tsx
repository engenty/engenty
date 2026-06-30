import { Link } from "react-router-dom";
import type { ProjectsBriefingResponse } from "../../api.js";

export function BriefingForgottenSection({
  items,
  overdueDays,
  t,
}: {
  items: ProjectsBriefingResponse["stale_items"];
  overdueDays: number;
  t: (key: string) => string;
}) {
  return (
    <section className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
      <h2 className="font-medium text-destructive text-sm">
        {t("briefing.sections.forgottenTitle")}
      </h2>
      <p className="mt-1 text-muted-foreground text-xs">
        {t("briefing.sections.forgottenHint").replace(
          "{{days}}",
          String(overdueDays)
        )}
      </p>
      <ul className="mt-3 space-y-2">
        {items.length === 0 ? (
          <li className="text-muted-foreground text-sm">
            {t("briefing.empty")}
          </li>
        ) : (
          items.map((row) => (
            <li className="text-sm" key={row.id}>
              <Link
                className="font-medium hover:underline"
                to={`/mdl/projects/${row.project_id}`}
              >
                {row.title}
              </Link>
              <div className="text-muted-foreground text-xs">
                {row.project_title} · {row.reason}
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
