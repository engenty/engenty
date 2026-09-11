import { Link } from "react-router-dom";
import type { ProjectsBriefingResponse } from "../../api.js";

export function BriefingWaitingSection({
  items,
  t,
}: {
  items: ProjectsBriefingResponse["waiting_items"];
  t: (key: string) => string;
}) {
  return (
    <section className="rounded-lg border border-border-soft bg-card p-4">
      <h2 className="font-medium text-sm">{t("briefing.sections.waiting")}</h2>
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
