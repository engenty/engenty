// Filter bar for the activity feed: agent (hideable for fixed-agent mode),
// status, and title search.

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type {
  ActivityFilterState,
  ActivityStatusFilter,
} from "./activity-entries";

const ALL_VALUE = "__all__";
const STATUS_VALUES: ActivityStatusFilter[] = [
  "all",
  "running",
  "failed",
  "finished",
];

interface ActivityFilterBarProps {
  agents: { id: string; name: string }[];
  filters: ActivityFilterState;
  /** Fixed-agent mode (agent detail tab): hides the agent select. */
  hideAgentFilter?: boolean;
  onChange: (next: ActivityFilterState) => void;
  t: (key: string) => string;
}

export function ActivityFilterBar({
  agents,
  filters,
  hideAgentFilter = false,
  onChange,
  t,
}: ActivityFilterBarProps) {
  // base-ui Select.Value renders the value key unless the Root is given an
  // `items` value→label map. Without these, the triggers showed "__all__"/"all".
  const agentItems: Record<string, string> = {
    [ALL_VALUE]: t("activity.filterAllAgents"),
    ...Object.fromEntries(agents.map((agent) => [agent.id, agent.name])),
  };
  const statusItems: Record<string, string> = Object.fromEntries(
    STATUS_VALUES.map((value) => [value, t(`activity.status_${value}`)])
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Input
        className="w-full sm:w-56"
        onChange={(event) =>
          onChange({ ...filters, search: event.target.value })
        }
        placeholder={t("activity.searchPlaceholder")}
        type="search"
        value={filters.search}
      />
      {hideAgentFilter ? null : (
        <Select
          items={agentItems}
          onValueChange={(next) =>
            onChange({ ...filters, agentId: next === ALL_VALUE ? null : next })
          }
          value={filters.agentId ?? ALL_VALUE}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={t("activity.filterAllAgents")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>
              {t("activity.filterAllAgents")}
            </SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select
        items={statusItems}
        onValueChange={(next) =>
          onChange({ ...filters, status: next as ActivityStatusFilter })
        }
        value={filters.status}
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`activity.status_${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
