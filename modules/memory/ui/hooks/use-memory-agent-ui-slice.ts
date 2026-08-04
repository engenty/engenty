import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";

const MEMORY_TAB_LABELS: Record<string, string> = {
  profile: "Profile",
  mine: "My memory",
  projects: "Projects",
  org: "Organization",
  entities: "Entities",
};

export function useMemorySettingsAgentUiSlice(input?: {
  selectedRef?: string | null;
  tab?: string;
}) {
  const slice = useMemo(() => {
    const tab = input?.tab?.trim() || "mine";
    const tabLabel = MEMORY_TAB_LABELS[tab] ?? tab;
    const ref = input?.selectedRef?.trim();
    const refHint =
      ref && (tab === "projects" || tab === "entities")
        ? ` Selected ref: ${ref}.`
        : "";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Memory",
          page_description: `Memory settings — ${tabLabel} tab.${refHint} Each scope is one editable document of agent-learned records.`,
        }),
        memory_tab: tab,
        ...(ref ? { memory_ref: ref } : {}),
      },
    };
  }, [input?.selectedRef, input?.tab]);

  useRegisterAgentUiSlice("memory.settings", slice);
}
