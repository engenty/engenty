import { useTranslation } from "@engenty/i18n/ui";
import { TabsList, TabsTrigger } from "@engenty/ui-core";
import type { ContactTab, ContactTabMeta } from "../hooks/use-contact-tabs.js";

/** Fallbacks when a tab key is missing from the loaded bundle (avoids raw keys in UI). */
const CONTACT_TAB_LABEL_DEFAULT: Record<ContactTab, string> = {
  overview: "Overview",
  info: "Info",
  contacts: "Contacts",
  offers: "Offers",
  invoices: "Invoices",
  projects: "Projects",
  expenses: "Expenses",
};

interface ContactSubNavProps {
  visibleTabs: readonly ContactTabMeta[];
}

/**
 * Line-style tabs for contact detail; must be rendered inside a `Tabs` root.
 */
export function ContactSubNav({ visibleTabs }: ContactSubNavProps) {
  const { t } = useTranslation("contacts");

  return (
    <TabsList
      className="-mb-px h-auto w-fit border-0 bg-transparent p-0"
      variant="line"
    >
      {visibleTabs.map((tab) => (
        <TabsTrigger key={tab.id} value={tab.id}>
          {t(tab.labelKey, {
            defaultValue: CONTACT_TAB_LABEL_DEFAULT[tab.id],
          })}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
