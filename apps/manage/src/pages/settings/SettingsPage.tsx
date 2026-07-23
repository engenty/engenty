import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AdminListTableView,
  Badge,
  ListSearchInput,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import { envVarsQuery } from "@/lib/queries/settings";

export function SettingsPage() {
  const { t } = useTranslation("common");
  const { data, isLoading, error, refetch } = useQuery(envVarsQuery);
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const list = data ?? [];
    const term = filter.trim().toLowerCase();
    if (!term) {
      return list;
    }
    return list.filter((v) => v.key.toLowerCase().includes(term));
  }, [data, filter]);

  const settingsTitle = t("settings.title");

  const breadcrumbs = useMemo(
    () => [
      {
        label: (
          <span className="font-medium text-foreground text-sm">
            {settingsTitle}
          </span>
        ),
        menuLabel: settingsTitle,
        to: "/settings",
      },
    ],
    [settingsTitle]
  );

  return (
    <PageShell breadcrumbs={breadcrumbs}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <div className="w-full min-w-0 max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
          <ListSearchInput
            className="w-full"
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("settings.filterPlaceholder")}
            value={filter}
            wrapperClassName="w-full"
          />
        </div>
        <PageState
          error={error}
          isEmpty={rows.length === 0}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          <AdminListTableView>
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead className="w-96">
                    {t("settings.columns.key")}
                  </TableHead>
                  <TableHead>{t("settings.columns.value")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((v) => (
                  <TableRow className="align-top" key={v.key}>
                    <TableCell className="font-mono text-xs">
                      <span className="break-all">{v.key}</span>
                      {v.masked ? (
                        <Badge className="ml-2" variant="outline">
                          {t("settings.masked")}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {v.missing ? (
                        <Badge
                          className="border-amber-500/60 text-amber-600 dark:text-amber-400"
                          variant="outline"
                        >
                          {t("settings.unset")}
                        </Badge>
                      ) : (
                        <span className="break-all">{v.value}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminListTableView>
        </PageState>
      </div>
    </PageShell>
  );
}
