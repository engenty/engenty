import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  DatePicker,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { Goal, GoalStatus } from "../../src/schema/types.js";
import { useTeamMembersCatalogQuery } from "../hooks/use-team-catalog-query.js";
import { buildTaskAssigneeMemberOptions } from "../lib/team-catalog-ui.js";
import { GOAL_STATUSES, GoalStatusBadge } from "./goal-status-badge.js";

/** Stable type key of the built-in coordinator agent. */
export const COORDINATOR_AGENT_TYPE_KEY = "engenty.coordinator";

const OWNER_NONE = "none";
const OWNER_COORDINATOR = `agent:${COORDINATOR_AGENT_TYPE_KEY}`;

export interface GoalOwnerChange {
  owner_agent_type_key: string | null;
  owner_user_id: string | null;
}

interface GoalPropertiesPanelProps {
  disabled?: boolean;
  goal: Goal;
  handoffPending?: boolean;
  onHandoffToCoordinator: () => void;
  onOwnerChange: (change: GoalOwnerChange) => void;
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
  onHandoffToCoordinator,
  onOwnerChange,
  onStatusChange,
  onTargetDateChange,
  disabled,
  handoffPending,
}: GoalPropertiesPanelProps) {
  const { t } = useTranslation("tasks");
  const membersQuery = useTeamMembersCatalogQuery();
  const memberOptions = useMemo(
    () => buildTaskAssigneeMemberOptions(membersQuery.data ?? []),
    [membersQuery.data]
  );

  const ownedByCoordinator =
    goal.owner_agent_type_key === COORDINATOR_AGENT_TYPE_KEY;
  const ownerValue = ownedByCoordinator
    ? OWNER_COORDINATOR
    : goal.owner_user_id
      ? `user:${goal.owner_user_id}`
      : OWNER_NONE;

  const handleOwnerChange = (value: string) => {
    if (value === OWNER_COORDINATOR) {
      onOwnerChange({
        owner_agent_type_key: COORDINATOR_AGENT_TYPE_KEY,
        owner_user_id: null,
      });
      return;
    }
    if (value.startsWith("user:")) {
      onOwnerChange({
        owner_agent_type_key: null,
        owner_user_id: value.slice("user:".length),
      });
      return;
    }
    onOwnerChange({ owner_agent_type_key: null, owner_user_id: null });
  };

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
          <Label>{t("goals.detail.owner")}</Label>
          <Select
            disabled={disabled}
            onValueChange={handleOwnerChange}
            value={ownerValue}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OWNER_NONE}>
                {t("goals.detail.ownerUnassigned")}
              </SelectItem>
              <SelectItem value={OWNER_COORDINATOR}>
                {t("goals.detail.ownerCoordinator")}
              </SelectItem>
              {memberOptions.map((option) => (
                <SelectItem key={option.value} value={`user:${option.value}`}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="w-full"
            disabled={disabled || handoffPending}
            onClick={onHandoffToCoordinator}
            size="sm"
            type="button"
            variant={ownedByCoordinator ? "outline" : "default"}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {ownedByCoordinator
              ? t("goals.detail.handoffRerun")
              : t("goals.detail.handoff")}
          </Button>
          <p className="text-muted-foreground text-xs">
            {t("goals.detail.handoffHint")}
          </p>
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
