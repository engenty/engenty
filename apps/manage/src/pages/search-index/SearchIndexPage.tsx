import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery } from "@engenty/query-client";
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
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import {
  type SearchIndexProvider,
  type SearchIndexSearchResult,
  type SearchStrategy,
  searchProvider,
} from "@/lib/api/search-index";
import {
  searchProviderStatusQuery,
  searchProvidersQuery,
} from "@/lib/queries/search-index";

const STRATEGIES: SearchStrategy[] = ["hybrid", "semantic", "lexical"];

export function SearchIndexPage() {
  const { t } = useTranslation("common");
  const providers = useQuery(searchProvidersQuery);
  const [selectedId, setSelectedId] = useState<string>("");

  const selected = providers.data?.find((p) => p.id === selectedId) ?? null;

  return (
    <PageShell
      breadcrumbs={[{ label: t("searchIndex.title") }]}
      title={t("searchIndex.title")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-page">
        <PageState
          error={providers.error}
          isEmpty={(providers.data?.length ?? 0) === 0}
          isLoading={providers.isLoading}
          onRetry={() => void providers.refetch()}
        >
          <AdminListTableView>
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead>{t("searchIndex.columns.provider")}</TableHead>
                  <TableHead>{t("searchIndex.columns.entity")}</TableHead>
                  <TableHead>{t("searchIndex.columns.module")}</TableHead>
                  <TableHead>{t("searchIndex.columns.supports")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(providers.data ?? []).map((provider) => (
                  <TableRow
                    className="cursor-pointer"
                    data-selected={provider.id === selectedId}
                    key={provider.id}
                    onClick={() => setSelectedId(provider.id)}
                  >
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{provider.id}</span>
                        {provider.is_system ? (
                          <Badge variant="outline">
                            {t("searchIndex.system")}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        v{provider.version}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {provider.entity_name}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {provider.module_id}
                    </TableCell>
                    <TableCell>
                      <SupportBadges provider={provider} t={t} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminListTableView>
        </PageState>

        {selected ? <ProviderDiagnostics provider={selected} t={t} /> : null}
      </div>
    </PageShell>
  );
}

function SupportBadges({
  provider,
  t,
}: {
  provider: SearchIndexProvider;
  t: (key: string) => string;
}) {
  const keys = (["status", "search", "backfill"] as const).filter(
    (k) => provider.supports[k]
  );
  return (
    <span className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <Badge key={k} variant="secondary">
          {t(`searchIndex.supports.${k}`)}
        </Badge>
      ))}
    </span>
  );
}

function ProviderDiagnostics({
  provider,
  t,
}: {
  provider: SearchIndexProvider;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const status = useQuery({
    ...searchProviderStatusQuery(provider.id),
    enabled: provider.supports.status,
  });
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] = useState<SearchStrategy>("hybrid");
  const [result, setResult] = useState<SearchIndexSearchResult | null>(null);

  const run = useMutation({
    mutationFn: () =>
      searchProvider(provider.id, { query: query.trim(), strategy, limit: 25 }),
    onSuccess: (data) => setResult(data),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) {
      run.mutate();
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <h2 className="font-medium text-sm">
        {t("searchIndex.diagnostics", { id: provider.id })}
      </h2>

      {provider.supports.status ? (
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">
            {t("searchIndex.status")}
          </span>
          {status.isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t("common.loading")}
            </p>
          ) : (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono text-xs">
              {JSON.stringify(status.data ?? {}, null, 2)}
            </pre>
          )}
        </div>
      ) : null}

      {provider.supports.search ? (
        <div className="space-y-2">
          <form className="flex flex-wrap items-end gap-2" onSubmit={onSubmit}>
            <Input
              aria-label={t("searchIndex.queryLabel")}
              className="w-72"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchIndex.queryPlaceholder")}
              value={query}
            />
            <Select
              onValueChange={(v) => setStrategy(v as SearchStrategy)}
              value={strategy}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!query.trim() || run.isPending}
              size="sm"
              type="submit"
            >
              {t("searchIndex.runSearch")}
            </Button>
          </form>

          {result ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                {t("searchIndex.matches", { total: result.total })}
              </p>
              <div className="divide-y divide-border/50 rounded border border-border">
                {result.matches.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-sm">
                    {t("searchIndex.noMatches")}
                  </p>
                ) : (
                  result.matches.map((match, index) => (
                    <details className="p-3 text-xs" key={index}>
                      <summary className="flex cursor-pointer items-center gap-2">
                        {typeof match.score === "number" ? (
                          <Badge variant="outline">
                            {match.score.toFixed(3)}
                          </Badge>
                        ) : null}
                        <span className="truncate font-mono">
                          {matchLabel(match)}
                        </span>
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">
                        {JSON.stringify(match, null, 2)}
                      </pre>
                    </details>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function matchLabel(match: Record<string, unknown>): string {
  for (const key of ["title", "name", "id", "entity_id", "document_id"]) {
    const value = match[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return JSON.stringify(match).slice(0, 80);
}
