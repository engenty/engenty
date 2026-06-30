import { useTranslation } from "@engenty/i18n/ui";
import {
  Card,
  DatePicker,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { Goal, GoalStatus } from "../../src/schema/types.js";
import { GOAL_STATUSES, GoalStatusBadge } from "./goal-status-badge.js";

interface GoalPropertiesPanelProps {
  disabled?: boolean;
  goal: Goal;
  onStatusChange: (status: GoalStatus) => void;
  onTargetDateChange: (targetDate: string | null) => void;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function GoalPropertiesPanel({
  goal,
  onStatusChange,
  onTargetDateChange,
  disabled,
}: GoalPropertiesPanelProps) {
  const { t } = useTranslation("tasks");

  return (
    <section className="min-w-[280px] space-y-2">
      <h2 className="font-medium text-sm">{t("goals.detail.properties")}</h2>
      <Card className="space-y-4" variant="form">
        <div className="space-y-2">
          <Label>{t("form.status")}</Label>
          <Select
            disabled={disabled}
            onValueChange={(value) => onStatusChange(value as GoalStatus)}
            value={goal.status}
          >
            <SelectTrigger>
              <SelectValue>{t(`goals.status.${goal.status}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {GOAL_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`goals.status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <GoalStatusBadge compact status={goal.status} />
        </div>

        <div className="space-y-2">
          <Label>{t("goals.form.targetDate")}</Label>
          <DatePicker
            disabled={disabled}
            onChange={onTargetDateChange}
            value={goal.target_date}
          />
        </div>

        <div>
          <span className="text-muted-foreground text-xs">
            {t("goals.detail.created")}
          </span>
          <p className="text-sm">{formatDateTime(goal.created_at)}</p>
        </div>

        <div>
          <span className="text-muted-foreground text-xs">
            {t("goals.detail.updated")}
          </span>
          <p className="text-sm">{formatDateTime(goal.updated_at)}</p>
        </div>
      </Card>
    </section>
  );
}
