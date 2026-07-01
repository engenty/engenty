import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { ContactListItem } from "../api.js";
import { getContactsPluginsApi } from "../plugins.js";

export type ContactTab =
  | "overview"
  | "info"
  | "contacts"
  | "offers"
  | "invoices"
  | "projects"
  | "expenses";

export interface ContactTabMeta {
  id: ContactTab;
  labelKey: string;
  /** Only show for organisation */
  orgOnly?: boolean;
  /** Plugin ID required; tab shown only when plugin is available */
  pluginId?: string;
}

export const CONTACT_TABS: readonly ContactTabMeta[] = [
  { id: "overview", labelKey: "detail.tabs.overview" },
  { id: "info", labelKey: "detail.tabs.info" },
  { id: "contacts", labelKey: "detail.tabs.contacts", orgOnly: true },
  { id: "offers", labelKey: "detail.tabs.offers", pluginId: "offers" },
  { id: "invoices", labelKey: "detail.tabs.invoices", pluginId: "invoices" },
  { id: "projects", labelKey: "detail.tabs.projects", pluginId: "projects" },
  { id: "expenses", labelKey: "detail.tabs.expenses", pluginId: "expenses" },
] as const;

const DEFAULT_TAB: ContactTab = "overview";

/** Pure: returns visible tabs for given entity and plugins API. Used by useContactTabs and tests. */
export function getVisibleContactTabs(
  entity: Pick<ContactListItem, "type"> | null,
  pluginsApi: { isPluginEnabled: (id: string) => boolean } | null
): readonly ContactTabMeta[] {
  return CONTACT_TABS.filter((tab) => {
    if (tab.orgOnly && entity?.type !== "organisation") {
      return false;
    }
    if (tab.pluginId && !pluginsApi?.isPluginEnabled(tab.pluginId)) {
      return false;
    }
    return true;
  });
}

export function useContactTabs(entity: ContactListItem | null) {
  const [searchParams, setSearchParams] = useSearchParams();

  const visibleTabs = useMemo(() => {
    const api = getContactsPluginsApi();
    return getVisibleContactTabs(entity, api);
  }, [entity]);

  const activeTab = useMemo(() => {
    const t = searchParams.get("tab");
    const valid = visibleTabs.map((x) => x.id);
    if (t && valid.includes(t as ContactTab)) {
      return t as ContactTab;
    }
    return DEFAULT_TAB;
  }, [searchParams, visibleTabs]);

  const setActiveTab = useCallback(
    (tab: ContactTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === DEFAULT_TAB) {
            next.delete("tab");
          } else {
            next.set("tab", tab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const effectiveActiveTab = useMemo(() => {
    if (visibleTabs.some((t) => t.id === activeTab)) {
      return activeTab;
    }
    return visibleTabs[0]?.id ?? DEFAULT_TAB;
  }, [activeTab, visibleTabs]);

  return {
    activeTab: effectiveActiveTab,
    setActiveTab,
    visibleTabs,
  };
}
