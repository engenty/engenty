import { Button } from "@engenty/ui-core";
import { Link } from "react-router-dom";
import type {
  ProjectsBriefingMode,
  ProjectsBriefingResponse,
} from "../../api.js";
import { BriefingModeToggle } from "./briefing-mode-toggle.js";

interface BriefingHeroProps {
  data: ProjectsBriefingResponse | undefined;
  mode: ProjectsBriefingMode;
  onModeChange: (mode: ProjectsBriefingMode) => void;
  subtitle: string;
  t: (key: string) => string;
}

export function BriefingHero({
  data,
  mode,
  onModeChange,
  subtitle,
  t,
}: BriefingHeroProps) {
  const s = data?.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {t("briefing.title")}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>
        </div>
        <BriefingModeToggle
          mode={mode}
          onModeChange={onModeChange}
          oversightLabel={t("briefing.mode.oversight")}
          personalLabel={t("briefing.mode.personal")}
        />
      </div>
      {s ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            label={t("briefing.metrics.dueWeek")}
            value={s.due_this_week}
          />
          <Metric
            label={t("briefing.metrics.blocked")}
            value={s.blocked_items}
          />
          <Metric
            label={t("briefing.metrics.waiting")}
            value={s.waiting_items}
          />
          <Metric label={t("briefing.metrics.stale")} value={s.stale_items} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/mdl/projects/tasks">{t("briefing.actions.planWeek")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/mdl/projects/updates">
            {t("briefing.actions.viewUpdates")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-semibold text-xl tabular-nums">{value}</div>
    </div>
  );
}
