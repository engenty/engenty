import { KbSidebarView } from "./kb-sidebar-view.js";
import type { KbSidebarProps } from "./use-kb-sidebar-model.js";
import { useKbSidebarModel } from "./use-kb-sidebar-model.js";

export function KbSidebar(props: KbSidebarProps) {
  const state = useKbSidebarModel(props);
  return <KbSidebarView state={state} />;
}
