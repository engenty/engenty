import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Card,
  DetailPageHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  Tabs,
  TabsContent,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import {
  MoreHorizontal,
  Pencil,
  Printer,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { deleteTeamMember, type TeamMemberListItem } from "../api.js";
import { TeamMemberDetailHeader } from "../components/team-member-detail-header.js";
import { useTeamMemberNameDetails } from "../components/team-member-view-base-info-section.js";
import {
  useTeamMemberDetailTabNav,
  useVisibleTeamMemberDetailTabs,
} from "../hooks/use-team-member-detail-tabs.js";
import { useTeamModuleSecondaryShellNav } from "../hooks/use-team-module-secondary-shell-nav.js";
import { teamMemberKeys, useTeamMemberDetailPageQuery } from "../queries.js";

// ---------------------------------------------------------------------------
// vCard generator
// ---------------------------------------------------------------------------

function buildVCard(member: TeamMemberListItem): string {
  const esc = (v: string | null | undefined) =>
    (v ?? "").replace(/[,;:\\]/g, (c) => `\\${c}`);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(member.full_name)}`,
    ...(member.email ? [`EMAIL:${esc(member.email)}`] : []),
    ...(member.phone ? [`TEL:${esc(member.phone)}`] : []),
    ...(member.position ? [`TITLE:${esc(member.position)}`] : []),
    ...(member.department ? [`ORG:;${esc(member.department)}`] : []),
    "END:VCARD",
  ];
  return lines.join("\r\n");
}

function downloadVCard(member: TeamMemberListItem) {
  const blob = new Blob([buildVCard(member)], { type: "text/vcard" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(member.full_name ?? "contact").replace(/\s+/g, "_")}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-40 shrink-0 text-muted-foreground text-sm sm:w-56">
        {label}
      </span>
      <span className="flex-1 text-sm">{value ?? "-"}</span>
    </div>
  );
}

export function TeamMemberDetailPage() {
  const { t } = useTranslation("team");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const shellNav = useTeamModuleSecondaryShellNav();
  const detailQuery = useTeamMemberDetailPageQuery(id ?? null);
  const member = detailQuery.data?.member ?? null;
  const loading = detailQuery.isLoading;
  const loadError =
    detailQuery.error == null
      ? null
      : detailQuery.error instanceof Error
        ? detailQuery.error.message
        : t("loadFailed");

  const visibleTabs = useVisibleTeamMemberDetailTabs();
  const { activeTab, onTabChange: handleTabChange } = useTeamMemberDetailTabNav(
    id,
    visibleTabs
  );

  useEffect(() => {
    if (
      activeTab !== "profile" &&
      !visibleTabs.some((tab) => tab.id === activeTab)
    ) {
      navigate(`/mdl/team/${id}`, { replace: true });
    }
  }, [activeTab, visibleTabs, id, navigate]);

  const { toggle: nameDetailsToggle, details: nameDetails } =
    useTeamMemberNameDetails(
      member ?? {
        birth_name: null,
        first_name: null,
        full_name: "",
        full_name_override: null,
        last_name: null,
        middle_name: null,
        name_prefix: null,
        name_suffix: null,
        phonetic_name: null,
      },
      t
    );

  const deleteMutation = useMutation({
    mutationFn: () => deleteTeamMember(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teamMemberKeys.all });
      navigate("/mdl/team");
    },
  });

  const memberName = member?.full_name ?? t("menu");
  const breadcrumbs = useMemo(
    () => [
      ...(shellNav.moduleRootCrumb ? [shellNav.moduleRootCrumb] : []),
      { label: memberName },
    ],
    [shellNav.moduleRootCrumb, memberName]
  );

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-1.5">
        <Button onClick={() => navigate(`/mdl/team/${id}/edit`)} size="sm">
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {t("edit")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("moreActions")}
              className="h-8 w-8"
              size="icon"
              variant="ghost"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!member}
              onClick={() => member && downloadVCard(member)}
            >
              <UserCheck className="mr-2 h-4 w-4" />
              {t("downloadVCard")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              {t("print")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                // biome-ignore lint/suspicious/noAlert: standard native confirm dialog is acceptable here
                if (window.confirm(t("confirmDelete"))) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteMutation.isPending ? t("loading") : t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [navigate, id, t, member, deleteMutation]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white header so the two blend.
    topbarOverlap: true,
  });

  if (loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <DetailPageHeader
          description={<Skeleton className="h-4 w-32" />}
          media={<Skeleton className="h-16 w-16 rounded-full" />}
          title={<Skeleton className="h-7 w-48" />}
        />
      </div>
    );
  }
  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }
  if (!member) {
    return <p className="text-muted-foreground text-sm">{t("notFound")}</p>;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Tabs
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
        onValueChange={handleTabChange}
        value={activeTab}
      >
        <TeamMemberDetailHeader member={member} visibleTabs={visibleTabs} />

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
          <div className="mx-auto w-full max-w-5xl">
            <TabsContent className="space-y-6" value="profile">
              <section className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-2xl leading-tight">
                    {member.full_name}
                  </span>
                  {nameDetailsToggle}
                </div>
                {nameDetails}
              </section>
              <section className="space-y-2">
                <div>
                  <h2 className="font-medium text-lg">
                    {t("publicProfileInfo")}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {t("publicProfileDescription")}
                  </p>
                </div>
                <Card variant="form">
                  <Row label={t("initials")} value={member.initials} />
                  <Row label={t("phone")} value={member.phone} />
                  <Row label={t("position")} value={member.position} />
                  <Row label={t("department")} value={member.department} />
                </Card>
              </section>
            </TabsContent>

            {/* Extension tab content (work, time, …) from the registry. The
                `hr` tab owns a standalone /hr route, so it has no inline content. */}
            {visibleTabs.map((tab) => {
              const TabContent = tab.content;
              if (!TabContent) {
                return null;
              }
              return (
                <TabsContent className="space-y-6" key={tab.id} value={tab.id}>
                  <TabContent member={member} />
                </TabsContent>
              );
            })}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
