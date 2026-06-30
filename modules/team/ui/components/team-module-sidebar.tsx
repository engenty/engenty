import { TeamModuleScopedNavLinks } from "./team-module-scoped-nav-links.js";
import { TeamSidebarChrome } from "./team-sidebar-chrome.js";

export function TeamModuleSidebar() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TeamSidebarChrome />
      <div className="mt-auto">
        <TeamModuleScopedNavLinks />
      </div>
    </div>
  );
}
