import {
  Button,
  Calendar,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { format } from "date-fns";
import { CalendarIcon, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AuditLogFilterOptions,
  AuditLogFilters as Filters,
} from "../types.js";
import { AuditLogTypeSelector } from "./audit-log-type-selector.js";

interface AuditLogFiltersProps {
  fetchFilterOptions?: () => Promise<AuditLogFilterOptions>;
  filters: Filters;
  labels?: Partial<{
    searchPlaceholder: string;
    from: string;
    to: string;
    targetType: string;
    allTypes: string;
    clearFilters: string;
  }>;
  onFiltersChange: (filters: Filters) => void;
}

const DEFAULT_TYPES = [
  "auth.login_started",
  "auth.login_completed",
  "auth.rate_limited",
  "policy.allow",
  "policy.deny",
  "policy.require_approval",
  "approval.created",
  "approval.decided",
  "operation.executed",
  "operation.rejected",
];

export function AuditLogFilters({
  filters,
  onFiltersChange,
  fetchFilterOptions,
  labels = {},
}: AuditLogFiltersProps) {
  const [options, setOptions] = useState<AuditLogFilterOptions>({
    types: [],
    module_ids: [],
  });
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);

  const {
    searchPlaceholder = "Search...",
    from = "From",
    to = "To",
    targetType = "Type",
    allTypes = "All types",
    clearFilters = "Clear filters",
  } = labels;

  useEffect(() => {
    if (fetchFilterOptions) {
      fetchFilterOptions()
        .then((data) =>
          setOptions({
            types: data?.types ?? [],
            module_ids: data?.module_ids ?? [],
          })
        )
        .catch(() => setOptions({ types: [], module_ids: [] }));
    } else {
      setOptions({ types: DEFAULT_TYPES, module_ids: [] });
    }
  }, [fetchFilterOptions]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== (filters.search ?? "")) {
        onFiltersChange({ ...filters, search: searchInput || undefined });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput, filters, onFiltersChange]);

  const types = options?.types ?? [];
  const moduleIds = options?.module_ids ?? [];
  const typeOptions = types.length > 0 ? types : DEFAULT_TYPES;
  const selectedTypes = filters.types ?? [];

  const handleTypesChange = (types: string[]) => {
    onFiltersChange({
      ...filters,
      types: types.length > 0 ? types : undefined,
    });
  };

  const clearAll = () => {
    setSearchInput("");
    onFiltersChange({});
  };

  const hasActiveFilters =
    filters.search ||
    (filters.types && filters.types.length > 0) ||
    filters.module_id ||
    filters.date_from ||
    filters.date_to;

  return (
    <div className="mb-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-[200px] max-w-xl flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 text-xs"
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            value={searchInput}
          />
        </div>

        <AuditLogTypeSelector
          className="h-9"
          label={targetType}
          onChange={handleTypesChange}
          options={typeOptions}
          placeholder={allTypes}
          value={selectedTypes}
        />

        {moduleIds.length > 0 && (
          <Select
            onValueChange={(v) =>
              onFiltersChange({
                ...filters,
                module_id: v === "all" ? undefined : v,
              })
            }
            value={filters.module_id ?? "all"}
          >
            <SelectTrigger className="h-9 w-[140px] text-xs">
              <SelectValue placeholder={targetType} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{allTypes}</SelectItem>
              {moduleIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Popover onOpenChange={setDateFromOpen} open={dateFromOpen}>
          <PopoverTrigger asChild>
            <Button
              className="h-9 gap-1.5 px-2.5 text-xs"
              size="sm"
              variant="outline"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {filters.date_from ? format(filters.date_from, "PP") : from}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              className="min-w-[200px]"
              mode="single"
              onSelect={(date) => {
                onFiltersChange({ ...filters, date_from: date ?? undefined });
                setDateFromOpen(false);
              }}
              selected={filters.date_from}
            />
          </PopoverContent>
        </Popover>

        <Popover onOpenChange={setDateToOpen} open={dateToOpen}>
          <PopoverTrigger asChild>
            <Button
              className="h-9 gap-1.5 px-2.5 text-xs"
              size="sm"
              variant="outline"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {filters.date_to ? format(filters.date_to, "PP") : to}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              className="min-w-[200px]"
              mode="single"
              onSelect={(date) => {
                onFiltersChange({ ...filters, date_to: date ?? undefined });
                setDateToOpen(false);
              }}
              selected={filters.date_to}
            />
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button
            className="h-9 gap-1.5 px-2 text-muted-foreground text-xs"
            onClick={clearAll}
            size="sm"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
            {clearFilters}
          </Button>
        )}
      </div>
    </div>
  );
}
