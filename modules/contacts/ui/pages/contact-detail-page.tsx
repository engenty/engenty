import { ActionButton } from "@engenty/ai-ui/embed";
import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  DetailPageHeader,
  Tabs,
  TabsContent,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { ContactListItem } from "../api.js";
import { ContactAgentNotesCard } from "../components/contact-agent-notes-card.js";
import { ContactInfoTab } from "../components/contact-info-tab.js";
import { ContactOverviewTab } from "../components/contact-overview-tab.js";
import { ContactRelationsTab } from "../components/contact-relations-tab.js";
import { ContactSubNav } from "../components/contact-sub-nav.js";
import { buildContactDetailCopilotContext } from "../copilot-context.js";
import {
  CONTACT_TABS,
  CONTACTS_DETAIL_SURFACE,
  type ContactTab,
  type ContactTabMeta,
  useContactTabs,
} from "../hooks/use-contact-tabs.js";
import { useContactsDetailAgentUiSlice } from "../hooks/use-contacts-agent-ui-slice.js";
import { useContactsModuleSecondaryShellNav } from "../hooks/use-contacts-module-secondary-shell-nav.js";
import { useContactDetailQuery } from "../queries.js";

export function ContactDetailPage() {
  const { t } = useTranslation("contacts");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const detailQuery = useContactDetailQuery(id ?? null);
  const entity = detailQuery.data ?? null;
  useContactsDetailAgentUiSlice(entity);
  const loading = detailQuery.isLoading;
  const error =
    detailQuery.error == null
      ? null
      : detailQuery.error instanceof Error
        ? detailQuery.error.message
        : t("loadFailed");
  const { setCopilotContext } = useCopilotShell();
  const initializedContactIdRef = useRef<string | null>(null);
  const { activeTab, setActiveTab, visibleTabs } = useContactTabs(entity);

  useEffect(() => {
    if (!entity || initializedContactIdRef.current === entity.id) {
      return;
    }
    initializedContactIdRef.current = entity.id;
    setCopilotContext(buildContactDetailCopilotContext(entity));
  }, [entity, setCopilotContext]);

  useEffect(
    () => () => {
      initializedContactIdRef.current = null;
      setCopilotContext(null);
    },
    [setCopilotContext]
  );

  const canEnhanceContact = entity?.type === "organisation";
  const title = entity?.display_name || t("client");

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useContactsModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [...(moduleRootCrumb ? [moduleRootCrumb] : []), { label: title }],
    [moduleRootCrumb, title]
  );

  const pageActions = useMemo(
    () =>
      loading || !entity ? null : (
        <div className="flex min-w-0 shrink items-center gap-1">
          {/* Enhance contact runs as a dispatched action (workforce plan R1).
              Results land in the action thread; no inline panel needed. */}
          <ActionButton
            actionId="contacts.enhance-contact"
            context={{ id: entity.id, type: "contacts.person" }}
            disabled={!canEnhanceContact}
            input={{ id: entity.id }}
            label={t("copilot.enhanceContact")}
            onError={(err) =>
              toast.error(t("copilot.enhanceContact"), {
                description: err.message,
              })
            }
            size="sm"
            variant="outline"
          />
          <Button
            className="shrink-0"
            onClick={() => navigate(`/mdl/contacts/${entity.id}/edit`)}
            size="sm"
          >
            {t("edit")}
          </Button>
        </div>
      ),
    [canEnhanceContact, entity, loading, navigate, t]
  );

  const handleDetailTabChange = useCallback(
    (value: string) => {
      if (visibleTabs.some((tab) => tab.id === value)) {
        setActiveTab(value as ContactTab);
      }
    },
    [setActiveTab, visibleTabs]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white header so the two blend.
    topbarOverlap: true,
  });

  if (loading) {
    return (
      <div className="p-4 text-muted-foreground text-sm">{t("loading")}</div>
    );
  }
  if (!(id && entity)) {
    return (
      <div className="p-4 text-muted-foreground text-sm">{t("notFound")}</div>
    );
  }

  const tabPlaceholder = (
    <p className="mt-4 text-muted-foreground text-sm">
      {t("detail.tabs.comingSoon", { defaultValue: "Coming soon" })}
    </p>
  );

  // Muted context line above the title (org legal name, or "person").
  const headerEyebrow =
    entity.type === "organisation"
      ? entity.legal_name?.trim() || entity.display_name?.trim() || null
      : t("person");

  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      data-engenty-region="detail"
    >
      <Tabs
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        onValueChange={handleDetailTabChange}
        value={activeTab}
      >
        <DetailPageHeader
          belowStrip={<ContactSubNav visibleTabs={visibleTabs} />}
          eyebrow={headerEyebrow}
          title={entity.display_name ?? ""}
        />

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
          {/* Padding inside max-w so the column aligns with DetailPageHeader. */}
          <div className="mx-auto w-full max-w-5xl p-page pb-10">
            {error ? (
              <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                {error}
              </div>
            ) : null}

            <TabsContent className="space-y-6" value="overview">
              <ContactOverviewTab entity={entity} />
              <ContactAgentNotesCard entity={entity} />
            </TabsContent>
            <TabsContent className="space-y-6" value="info">
              <ContactInfoTab entity={entity} />
            </TabsContent>
            <TabsContent className="space-y-6" value="contacts">
              {entity.type === "organisation" ? (
                <ContactRelationsTab entity={entity} />
              ) : (
                tabPlaceholder
              )}
            </TabsContent>
            <TabsContent className="space-y-6" value="offers">
              <ContributedTabContent
                entity={entity}
                fallback={tabPlaceholder}
                tab={visibleTabs.find((tab) => tab.id === "offers")}
              />
            </TabsContent>
            <TabsContent className="space-y-6" value="invoices">
              {entity ? (
                <Card>
                  <div className="space-y-4 p-6">
                    <p className="text-muted-foreground text-sm">
                      {t("detail.invoicesIntro")}
                    </p>
                    {entity.linked_invoices_count === undefined ? null : (
                      <p className="font-medium text-sm">
                        {t("detail.linkedInvoiceCount", {
                          count: entity.linked_invoices_count,
                        })}
                      </p>
                    )}
                    <Button asChild>
                      <Link
                        to={`/mdl/invoices?clientId=${encodeURIComponent(entity.id)}`}
                      >
                        {t("detail.viewInvoices")}
                      </Link>
                    </Button>
                  </div>
                </Card>
              ) : null}
            </TabsContent>
            <TabsContent className="space-y-6" value="projects">
              <ContributedTabContent
                entity={entity}
                fallback={tabPlaceholder}
                tab={visibleTabs.find((tab) => tab.id === "projects")}
              />
            </TabsContent>
            <TabsContent className="space-y-6" value="expenses">
              <ContributedTabContent
                entity={entity}
                fallback={tabPlaceholder}
                tab={visibleTabs.find((tab) => tab.id === "expenses")}
              />
            </TabsContent>
            {/* Tabs contributed under ids without a native slot. */}
            {visibleTabs
              .filter(
                (tab) =>
                  tab.component && !NATIVE_CONTACT_TAB_IDS.has(tab.id as string)
              )
              .map((tab) => (
                <TabsContent className="space-y-6" key={tab.id} value={tab.id}>
                  <ContributedTabContent entity={entity} tab={tab} />
                </TabsContent>
              ))}
          </div>
        </div>
      </Tabs>
    </div>
  );
}

const NATIVE_CONTACT_TAB_IDS = new Set(
  CONTACT_TABS.map((tab) => tab.id as string)
);

/** Renders a module-contributed tab body, passing the contact as params. */
function ContributedTabContent({
  entity,
  fallback = null,
  tab,
}: {
  entity: ContactListItem;
  fallback?: ReactNode;
  tab: ContactTabMeta | undefined;
}) {
  const Component = tab?.component;
  if (!Component) {
    return <>{fallback}</>;
  }
  return (
    <Component
      params={{
        contact_display_name: entity.display_name,
        contact_id: entity.id,
        contact_type: entity.type,
      }}
      surface={CONTACTS_DETAIL_SURFACE}
    />
  );
}
