import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { AnimatedRefreshIcon } from "@engenty/ui-icons";
import { Plus, RotateCcw, Search } from "lucide-react";
import type { OntologyEntityType } from "../api.js";
import type { GraphFilter } from "./use-cg-graph-data.js";

interface Props {
  entityTypes: OntologyEntityType[];
  filter: GraphFilter;
  isReloading?: boolean;
  nodeCount: number;
  onChange: (next: GraphFilter) => void;
  onNewEdge: () => void;
  onNewEntity: () => void;
  onReload: () => void;
  onReset: () => void;
}

export function CgGraphControls({
  entityTypes,
  filter,
  isReloading = false,
  nodeCount,
  onChange,
  onNewEdge,
  onNewEntity,
  onReload,
  onReset,
}: Props) {
  return (
    <div className="absolute top-3 right-3 z-10 flex w-60 flex-col gap-2 rounded-xl border border-border/80 bg-background/90 p-3 shadow-lg backdrop-blur-sm">
      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-7 pl-7 text-xs"
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder="Search entities…"
          value={filter.search}
        />
      </div>

      {/* Type filter */}
      <Select
        onValueChange={(v) =>
          onChange({ ...filter, typeFilter: v === "_all" ? "" : v })
        }
        value={filter.typeFilter || "_all"}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All types</SelectItem>
          {entityTypes.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Legend badges */}
      {filter.typeFilter ? (
        <Badge
          className="cursor-pointer text-xxs"
          onClick={() => onChange({ ...filter, typeFilter: "" })}
          variant="secondary"
        >
          ✕{" "}
          {entityTypes.find((t) => t.id === filter.typeFilter)?.displayName ??
            filter.typeFilter}
        </Badge>
      ) : null}

      {/* New entity / new edge */}
      <div className="flex gap-1.5">
        <Button
          className="h-6 flex-1 gap-1 px-2 text-xxs"
          onClick={onNewEntity}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="h-3 w-3" />
          Entity
        </Button>
        <Button
          className="h-6 flex-1 gap-1 px-2 text-xxs"
          onClick={onNewEdge}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="h-3 w-3" />
          Edge
        </Button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="min-w-0 truncate text-muted-foreground text-xxs">
          {nodeCount} node{nodeCount === 1 ? "" : "s"}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            className="h-6 gap-1 px-2 text-xxs"
            disabled={isReloading}
            onClick={onReload}
            size="sm"
            type="button"
            variant="ghost"
          >
            <AnimatedRefreshIcon
              play={isReloading ? "always" : "hover"}
              size={12}
            />
          </Button>
          <Button
            className="h-6 gap-1 px-2 text-xxs"
            onClick={onReset}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
