/**
 * The Data sidebar's search: the same field every module sidebar has
 * (Contacts, Projects, Tasks …), and its hits grouped under the tree's headings.
 */
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Input,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import { Loader2, Search, X } from "lucide-react";
import {
  ChildRows,
  type DriveRowContext,
} from "@/components/spaces/space-data/drive-row";
import { SpaceSectionHeading } from "@/components/spaces/space-section-heading";
import type { SpaceDataSearchGroup } from "@/lib/space-data-search";
import { spaceDataSectionHeadingLabel } from "@/lib/space-data-section-label";

export function SpaceDataSearchField({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation("common");
  return (
    <div
      className={cn(
        "flex min-w-0 items-center",
        sidebarColumnContentInsetClassName,
        sidebarColumnContentInsetEndClassName
      )}
    >
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
        />
        <Input
          aria-label={t("spaces.data.searchPlaceholder", {
            defaultValue: "Search data",
          })}
          className="h-8 w-full py-0 pr-7 pl-8 text-sm"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onChange("");
            }
          }}
          placeholder={t("spaces.data.searchPlaceholder", {
            defaultValue: "Search data",
          })}
          value={value}
          {...shellSecondaryNavItemProps}
        />
        {value.trim() ? (
          <Button
            aria-label={t("spaces.data.searchClear", {
              defaultValue: "Clear search",
            })}
            className="absolute top-1/2 right-1 h-6 w-6 shrink-0 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
            size="icon"
            tabIndex={-1}
            type="button"
            variant="ghost"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SpaceDataSearchResults({
  context,
  groups,
  isPending,
  labelsByModuleId,
  unavailable,
}: {
  context: DriveRowContext;
  groups: SpaceDataSearchGroup[];
  isPending: boolean;
  labelsByModuleId: Record<string, string>;
  unavailable: string[];
}) {
  const { t } = useTranslation("common");

  function labelOf(group: SpaceDataSearchGroup): string {
    if (group.section) {
      return spaceDataSectionHeadingLabel(group.section, labelsByModuleId, t);
    }
    if (group.moduleId === "space-agents") {
      return t("spaces.data.filesSection", { defaultValue: "Files" });
    }
    return spaceDataSectionHeadingLabel(
      {
        label: group.root ?? "",
        root: group.nodes[0]
          ? { ...group.nodes[0], moduleId: group.moduleId ?? "" }
          : null,
      },
      labelsByModuleId,
      t
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {unavailable.length > 0 ? (
        <p className="py-2 pl-2 text-muted-foreground text-xs">
          {t("spaces.data.searchPartial", { sources: unavailable.join(", ") })}
        </p>
      ) : null}
      {groups.map((group) => (
        <div className="flex flex-col" key={group.id}>
          <SpaceSectionHeading>{labelOf(group)}</SpaceSectionHeading>
          <ChildRows context={context} depth={-1} nodes={group.nodes} />
          {group.truncated ? (
            <p className="px-2 pt-1 text-muted-foreground text-xs">
              {t("spaces.data.searchTruncated", {
                defaultValue: "More matches — refine the search",
              })}
            </p>
          ) : null}
        </div>
      ))}
      {isPending ? (
        <p
          className="flex items-center gap-2 py-2 pl-2 text-muted-foreground text-xs"
          role="status"
        >
          <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />
          {t("spaces.data.searchLoading", { defaultValue: "Searching…" })}
        </p>
      ) : groups.length === 0 ? (
        <p className="py-2 pl-2 text-muted-foreground text-xs">
          {t("spaces.data.searchEmpty", { defaultValue: "Nothing found" })}
        </p>
      ) : null}
    </div>
  );
}
