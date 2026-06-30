import { Link } from "react-router-dom";
import type { ProjectsBriefingResponse } from "../../api.js";

export function BriefingAttentionSection({
  items,
  t,
}: {
  items: ProjectsBriefingResponse["attention_items"];
  t: (key: string) => string;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-4">
      <h2 className="font-medium text-sm">
        {t("briefing.sections.attention")}
      </h2>
      <ul className="mt-3 space-y-2">
        {items.length === 0 ? (
          <li className="text-muted-foreground text-sm">
            {t("briefing.empty")}
          </li>
        ) : (
          items.map((row) => (
            <li className="text-sm" key={row.id}>
              {row.project_id ? (
                <Link
                  className="font-medium hover:underline"
                  to={`/mdl/projects/${row.project_id}`}
                >
                  {row.title}
                </Link>
              ) : (
                <span className="font-medium">{row.title}</span>
              )}
              <div className="text-muted-foreground text-xs">{row.reason}</div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
