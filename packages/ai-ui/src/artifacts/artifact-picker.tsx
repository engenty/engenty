import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { iconForArtifactType } from "./artifact-icons.js";

/** Above this many entries the list gets a search box. */
const SEARCH_THRESHOLD = 5;

export interface ArtifactPickerItem {
  /** Offer the close/archive affordance (open entries only). */
  closable?: boolean;
  id: string;
  label: string;
  /** Home scope of a stored artifact; thread scope stays unlabelled. */
  scopeLabel?: string | null;
  /** Artifact type id — picks the row icon. */
  type: string;
}

export interface ArtifactPickerProps {
  activeId: string | null;
  /** Entries open in this pane: its artifacts plus object/file tabs. */
  items: ArtifactPickerItem[];
  /** Every other artifact in the space — picking one opens it here. */
  library: ArtifactPickerItem[];
  onClose: (id: string) => void;
  onSelect: (id: string) => void;
}

/**
 * The artifact pane's chooser. Artifacts are not bound to the chat that made
 * them, so one dropdown lists what the pane already holds and the rest of the
 * space below it.
 */
export function ArtifactPicker({
  activeId,
  items,
  library,
  onClose,
  onSelect,
}: ArtifactPickerProps) {
  const { t } = useTranslation("ai-ui");
  const [open, setOpen] = useState(false);

  const active =
    items.find((item) => item.id === activeId) ??
    library.find((item) => item.id === activeId) ??
    null;
  const ActiveIcon = active ? iconForArtifactType(active.type) : null;
  const searchable = items.length + library.length > SEARCH_THRESHOLD;

  const renderItem = (item: ArtifactPickerItem) => {
    const Icon = iconForArtifactType(item.type);
    return (
      <CommandItem
        key={item.id}
        onSelect={() => {
          onSelect(item.id);
          setOpen(false);
        }}
        value={`${item.label} ${item.id}`}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.scopeLabel ? (
          <Badge className="shrink-0" variant="secondary">
            {item.scopeLabel}
          </Badge>
        ) : null}
        {item.closable ? (
          <button
            aria-label={`${t("artifacts.closeTab")}: ${item.label}`}
            className="shrink-0 rounded p-0.5 text-muted-foreground/70 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              event.stopPropagation();
              onClose(item.id);
            }}
            onMouseDown={(event) => event.stopPropagation()}
            type="button"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </CommandItem>
    );
  };

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label={t("artifacts.pickerLabel")}
        className="flex h-7 min-w-0 max-w-72 items-center gap-1.5 rounded-md px-2 text-sm outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ActiveIcon ? (
          <ActiveIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        <span
          className={cn("min-w-0 truncate", !active && "text-muted-foreground")}
        >
          {active?.label ?? t("artifacts.pickerPlaceholder")}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command shouldFilter={searchable}>
          {searchable ? (
            <CommandInput placeholder={t("artifacts.pickerSearch")} />
          ) : null}
          <CommandList className="max-h-72">
            <CommandEmpty>{t("artifacts.pickerNoMatch")}</CommandEmpty>
            {items.length > 0 ? (
              <CommandGroup heading={t("artifacts.pickerOpen")}>
                {items.map(renderItem)}
              </CommandGroup>
            ) : null}
            {library.length > 0 ? (
              <CommandGroup heading={t("artifacts.pickerSpace")}>
                {library.map(renderItem)}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
