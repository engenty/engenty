import { Button, Input } from "@engenty/ui-core";
import { Plus, Search } from "lucide-react";

export function DataTableToolbar({
  onOpenCreate,
  onSearchChange,
  recordCount,
  search,
}: {
  onOpenCreate: () => void;
  onSearchChange: (value: string) => void;
  recordCount: number;
  search: string;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 px-4">
      <span className="text-muted-foreground text-xs tabular-nums">
        {recordCount} {recordCount === 1 ? "record" : "records"}
      </span>
      <div className="relative ml-auto w-full max-w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          className="h-8 bg-transparent pr-3 pl-8 text-sm shadow-none"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          value={search}
        />
      </div>
      <Button onClick={onOpenCreate} size="sm">
        <Plus className="size-3.5" />
        New
      </Button>
    </div>
  );
}

export function DataTableNewRow({
  onOpenCreate,
}: {
  onOpenCreate: () => void;
}) {
  return (
    <div className="ui-canvas-stack-top shrink-0">
      <button
        className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-muted-foreground text-sm transition-colors hover:bg-muted/40 hover:text-foreground"
        onClick={onOpenCreate}
        type="button"
      >
        <Plus className="size-3.5" />
        New
      </button>
    </div>
  );
}
