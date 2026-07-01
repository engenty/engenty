/**
 * Compact FAQ list (or empty hint) in the module secondary column.
 */

import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { matchesPath } from "@engenty/app-shell/navigation";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  cn,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarRow,
  SidebarRowButton,
  SidebarRowLeadingIcon,
  SidebarSectionLabel,
  sidebarSectionLabelPlAlignToRootRowIconClassName,
} from "@engenty/ui-core";
import { HelpCircle } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { kbFaqPath, kbFaqsListPath } from "../../kb-paths.js";
import { faqsQueryOptions } from "../../queries.js";

const FAQ_SIDEBAR_PREVIEW_SIZE = 8;

export function KbSidebarFaqsSection({
  embedded = false,
  kbId,
  kbSlug,
}: {
  /** When true, omit section heading (tabs provide context). */
  embedded?: boolean;
  kbId: string;
  kbSlug: string;
}) {
  const { t } = useTranslation("kb");
  const { pathname, search } = useLocation();
  const { data: faqPage, isLoading } = useQuery(
    faqsQueryOptions({
      kb_id: kbId,
      page: 1,
      page_size: FAQ_SIDEBAR_PREVIEW_SIZE,
      sort_by: "sort_order",
      sort_order: "asc",
    })
  );

  const faqs = faqPage?.data ?? [];
  const listTo = kbFaqsListPath(kbSlug);
  const listActive = matchesPath(pathname, search, listTo);

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1">
      {embedded ? null : (
        <SidebarSectionLabel align="root">
          {t("inbox.nav_faqs")}
        </SidebarSectionLabel>
      )}
      <SidebarGroupContent>
        {isLoading ? (
          <p
            className={cn(
              "py-1.5 text-muted-foreground text-xs",
              sidebarSectionLabelPlAlignToRootRowIconClassName
            )}
          >
            {t("sidebar.list_loading")}
          </p>
        ) : faqs.length === 0 ? (
          <p
            className={cn(
              "py-1.5 text-muted-foreground text-xs",
              sidebarSectionLabelPlAlignToRootRowIconClassName
            )}
          >
            {t("sidebar.empty_faqs")}
          </p>
        ) : (
          <SidebarMenu className="gap-0.5">
            {faqs.map((faq) => {
              const to = kbFaqPath(kbSlug, faq.id);
              const isActive = matchesPath(pathname, search, to);
              return (
                <SidebarRow isActive={isActive} key={faq.id}>
                  <SidebarRowLeadingIcon icon={<HelpCircle aria-hidden />} />
                  <SidebarRowButton asChild isActive={isActive} size="sm">
                    <Link to={to} {...shellSecondaryNavItemProps}>
                      <span className="truncate">{faq.question}</span>
                    </Link>
                  </SidebarRowButton>
                </SidebarRow>
              );
            })}
            <SidebarRow isActive={listActive}>
              <SidebarRowButton asChild isActive={listActive} size="sm">
                <Link
                  className="text-muted-foreground text-xs"
                  to={listTo}
                  {...shellSecondaryNavItemProps}
                >
                  {t("sidebar.view_all_faqs")}
                </Link>
              </SidebarRowButton>
            </SidebarRow>
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
