import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AdminListTableView,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { type FormEvent, Fragment, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import { AUDIT_PAGE_SIZE } from "@/lib/api/audit";
import { auditDistinctsQuery, auditEventsQuery } from "@/lib/queries/audit";
import { tenantsQuery } from "@/lib/queries/tenants";

const ALL = "__all__";

export function AuditPage() {
  const { t } = useTranslation("common");
  const tenants = useQuery(tenantsQuery);
  const [tenantId, setTenantId] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [moduleId, setModuleId] = useState<string>(ALL);
  const [searchInput, setSearchInput] = useState("");
  const [actorInput, setActorInput] = useState("");
  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const scopedTenant = tenantId === ALL ? undefined : tenantId;
  const distincts = useQuery(auditDistinctsQuery(scopedTenant));

  const params = useMemo(
    () => ({
      tenant_id: scopedTenant,
      types: type === ALL ? undefined : [type],
      module_id: moduleId === ALL ? undefined : moduleId,
      search: search || undefined,
      actor_id: actor || undefined,
      page,
    }),
    [scopedTenant, type, moduleId, search, actor, page]
  );

  const eventsQuery = useQuery(auditEventsQuery(params));
  const events = eventsQuery.data?.events ?? [];
  const total = eventsQuery.data?.total ?? 0;
  const hasMore = eventsQuery.data?.has_more ?? false;
  const rangeStart = total === 0 ? 0 : page * AUDIT_PAGE_SIZE + 1;
  const rangeEnd = page * AUDIT_PAGE_SIZE + events.length;

  const tenantName = (id: string | null) => {
    if (!id) {
      return t("audit.platformScope");
    }
    return tenants.data?.find((tenant) => tenant.id === id)?.name ?? id;
  };

  const resetPaging = () => {
    setPage(0);
    setExpanded(null);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setActor(actorInput.trim());
    resetPaging();
  };

  return (
    <PageShell
      breadcrumbs={[{ label: t("audit.title") }]}
      title={t("audit.title")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <p className="text-muted-foreground text-sm">{t("audit.subtitle")}</p>

        <div className="flex flex-wrap items-end gap-2">
          <Select
            onValueChange={(value) => {
              setTenantId(value);
              // A different tenant has its own type/module vocabulary.
              setType(ALL);
              setModuleId(ALL);
              resetPaging();
            }}
            value={tenantId}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("audit.allTenants")}</SelectItem>
              {(tenants.data ?? []).map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => {
              setType(value);
              resetPaging();
            }}
            value={type}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("audit.allTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("audit.allTypes")}</SelectItem>
              {(distincts.data?.types ?? []).map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => {
              setModuleId(value);
              resetPaging();
            }}
            value={moduleId}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("audit.allModules")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("audit.allModules")}</SelectItem>
              {(distincts.data?.module_ids ?? []).map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <form className="flex items-end gap-2" onSubmit={onSubmit}>
            <Input
              aria-label={t("common.search")}
              className="w-56"
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("audit.searchPlaceholder")}
              value={searchInput}
            />
            <Input
              aria-label={t("audit.actorPlaceholder")}
              className="w-48"
              onChange={(e) => setActorInput(e.target.value)}
              placeholder={t("audit.actorPlaceholder")}
              value={actorInput}
            />
            <Button size="sm" type="submit" variant="outline">
              {t("common.search")}
            </Button>
          </form>
        </div>

        <PageState
          error={eventsQuery.error}
          isEmpty={events.length === 0}
          isLoading={eventsQuery.isLoading}
          onRetry={() => void eventsQuery.refetch()}
        >
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>
              {t("logs.range", { start: rangeStart, end: rangeEnd, total })}
            </span>
            <span className="flex items-center gap-2">
              <Button
                disabled={page === 0}
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  setExpanded(null);
                }}
                size="sm"
                variant="outline"
              >
                {t("common.previous")}
              </Button>
              <Button
                disabled={!hasMore}
                onClick={() => {
                  setPage((p) => p + 1);
                  setExpanded(null);
                }}
                size="sm"
                variant="outline"
              >
                {t("common.next")}
              </Button>
            </span>
          </div>

          <AdminListTableView>
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead className="w-48">
                    {t("audit.columns.time")}
                  </TableHead>
                  <TableHead>{t("audit.columns.type")}</TableHead>
                  <TableHead>{t("audit.columns.actor")}</TableHead>
                  <TableHead>{t("audit.columns.tenant")}</TableHead>
                  <TableHead>{t("audit.columns.module")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const isOpen = expanded === event.id;
                  return (
                    <Fragment key={event.id}>
                      <TableRow
                        className="cursor-pointer align-top"
                        onClick={() => setExpanded(isOpen ? null : event.id)}
                      >
                        <TableCell className="font-mono text-muted-foreground text-xs">
                          {event.timestamp}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-sm">
                            {event.type}
                          </span>
                          {event.operation_id ? (
                            <div className="text-muted-foreground text-xs">
                              {event.operation_id}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground text-xs">
                          {event.actor_id ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {tenantName(event.tenant_id)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {event.module_id ?? event.source_kind}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isOpen ? (
                        <TableRow>
                          <TableCell className="bg-muted/40" colSpan={5}>
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
                              {JSON.stringify(event.detail, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </AdminListTableView>
        </PageState>
      </div>
    </PageShell>
  );
}
