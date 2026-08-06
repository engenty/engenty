import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import {
  cn,
  Input,
  SidebarHeader,
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
} from "@engenty/ui-core";
import { Search } from "lucide-react";
import { useThreadList } from "./thread-list-context.js";
import { ThreadListSettingsMenu } from "./thread-list-settings-menu.js";

export function ThreadListHeader() {
  const list = useThreadList();
  return (
    <SidebarHeader className="gap-0 p-0 pb-2">
      <div
        className={cn(
          "flex min-w-0 items-center gap-1",
          sidebarColumnContentInsetClassName,
          sidebarColumnContentInsetEndClassName
        )}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={list.labels.searchPlaceholder}
            className="h-8 pr-3 pl-7 text-xs"
            disabled={!list.isTransportReady}
            onChange={(event) => list.onSearchQueryChange(event.target.value)}
            placeholder={list.labels.searchPlaceholder}
            value={list.searchQuery}
            {...shellSecondaryNavItemProps}
          />
        </div>
        <ThreadListSettingsMenu />
      </div>
    </SidebarHeader>
  );
}
