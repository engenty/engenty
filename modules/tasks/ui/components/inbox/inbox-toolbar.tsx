import {
  ListFilterSelectTrigger,
  ListSearchInput,
  ListToolbar,
  ListToolbarMainArea,
  ListToolbarSearch,
  ListToolbarSummary,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@engenty/ui-core";
import type { InboxKindFilter } from "../../lib/inbox-classification.js";

export interface InboxToolbarLabels {
  filterAll: string;
  filterErrors: string;
  filterHitl: string;
  filterUpdates: string;
  paginationSummary: string;
  searchPlaceholder: string;
}

interface InboxToolbarProps {
  kindFilter: InboxKindFilter;
  labels: InboxToolbarLabels;
  onKindFilterChange: (value: InboxKindFilter) => void;
  onSearchChange: (value: string) => void;
  searchQuery: string;
}

const FILTER_LABEL_KEY: Record<
  InboxKindFilter,
  keyof Pick<
    InboxToolbarLabels,
    "filterAll" | "filterHitl" | "filterErrors" | "filterUpdates"
  >
> = {
  all: "filterAll",
  hitl: "filterHitl",
  errors: "filterErrors",
  updates: "filterUpdates",
};

export function InboxToolbar({
  kindFilter,
  labels,
  onKindFilterChange,
  onSearchChange,
  searchQuery,
}: InboxToolbarProps) {
  return (
    <ListToolbar>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full"
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={labels.searchPlaceholder}
            value={searchQuery}
            wrapperClassName="w-full"
          />
        </ListToolbarSearch>
        <Select
          onValueChange={(value) =>
            onKindFilterChange((value ?? "all") as InboxKindFilter)
          }
          value={kindFilter}
        >
          <ListFilterSelectTrigger className="min-w-[9rem]">
            <SelectValue>{labels[FILTER_LABEL_KEY[kindFilter]]}</SelectValue>
          </ListFilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{labels.filterAll}</SelectItem>
            <SelectItem value="hitl">{labels.filterHitl}</SelectItem>
            <SelectItem value="errors">{labels.filterErrors}</SelectItem>
            <SelectItem value="updates">{labels.filterUpdates}</SelectItem>
          </SelectContent>
        </Select>
        <ListToolbarSummary>{labels.paginationSummary}</ListToolbarSummary>
      </ListToolbarMainArea>
    </ListToolbar>
  );
}
