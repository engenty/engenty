import { SidebarNavList, SidebarNavSectionLabel } from "@engenty/ui-core";
import { useThreadList } from "./thread-list-context.js";
import { ThreadListItem } from "./thread-list-item.js";

export function ThreadListList() {
  const list = useThreadList();
  return (
    <SidebarNavList>
      {list.groups.map((group) => (
        <div className="contents" key={group.id}>
          {group.label ? (
            <SidebarNavSectionLabel>{group.label}</SidebarNavSectionLabel>
          ) : null}
          {group.threads.map((row) => (
            <ThreadListItem key={row.id} row={row} />
          ))}
        </div>
      ))}
    </SidebarNavList>
  );
}
