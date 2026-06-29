import { SidebarNavList, SidebarNavSectionLabel } from "@engenty/ui-core";
import { useSessionList } from "./session-list-context.js";
import { SessionListItem } from "./session-list-item.js";

export function SessionListList() {
  const list = useSessionList();
  return (
    <SidebarNavList>
      {list.groups.map((group) => (
        <div className="contents" key={group.id}>
          {group.label ? (
            <SidebarNavSectionLabel>{group.label}</SidebarNavSectionLabel>
          ) : null}
          {group.sessions.map((row) => (
            <SessionListItem key={row.id} row={row} />
          ))}
        </div>
      ))}
    </SidebarNavList>
  );
}
