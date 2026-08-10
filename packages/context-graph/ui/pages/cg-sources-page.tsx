import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ContextGraphSourceMeta } from "../api.js";
import { getSourceStatus, getSources, syncSource } from "../api.js";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function progressLabel(inGraph: number, inSource: number): string {
  if (inSource === 0) {
    return "No records in source";
  }
  if (inGraph === 0) {
    return `0 / ${inSource} synced`;
  }
  if (inGraph >= inSource) {
    return `${inGraph} synced`;
  }
  return `${inGraph} / ${inSource} synced`;
}

function SourceCard({ source }: { source: ContextGraphSourceMeta }) {
  const qc = useQueryClient();
  const statusKey = ["context-graph", "sources", source.id, "status"] as const;

  const statusQuery = useQuery({
    queryKey: statusKey,
    queryFn: ({ signal }) => getSourceStatus(source.id, signal),
    staleTime: 30_000,
  });

  const syncMut = useMutation({
    mutationFn: () => syncSource(source.id),
    onSuccess: (result) => {
      toast.success(
        `${source.displayName} synced: ${result.entities} entities, ${result.edges} edges`
      );
      void qc.invalidateQueries({ queryKey: statusKey });
      void qc.invalidateQueries({ queryKey: ["context-graph", "entities"] });
      void qc.invalidateQueries({ queryKey: ["context-graph", "edges"] });
    },
    onError: (err) => {
      toast.error(
        `Sync failed: ${err instanceof Error ? err.message : String(err)}`
      );
    },
  });

  const status = statusQuery.data;
  const isSynced =
    status !== undefined &&
    status.inSource > 0 &&
    status.inGraph >= status.inSource;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">{source.displayName}</CardTitle>
            {source.description && (
              <CardDescription className="text-xs">
                {source.description}
              </CardDescription>
            )}
          </div>
          {status && (
            <Badge
              className="shrink-0 text-xxs"
              variant={isSynced ? "default" : "secondary"}
            >
              {isSynced ? (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              ) : (
                <AlertCircle className="mr-1 h-3 w-3" />
              )}
              {isSynced ? "In sync" : "Out of sync"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {statusQuery.isLoading ? (
          <div className="space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-1.5 animate-pulse rounded-full bg-muted" />
          </div>
        ) : statusQuery.error ? (
          <p className="text-destructive text-xs">Could not load status.</p>
        ) : status ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {progressLabel(status.inGraph, status.inSource)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {status.inSource} in source
              </span>
            </div>
            <ProgressBar max={status.inSource} value={status.inGraph} />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 pt-1">
          {source.entityTypeIds.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {source.entityTypeIds.map((id, i) => (
                <span key={id}>
                  {i > 0 && ", "}
                  <span className="font-mono">{id}</span>
                </span>
              ))}
            </p>
          )}
          <Button
            className="ml-auto h-7 gap-1.5 px-3 text-xs"
            disabled={syncMut.isPending || statusQuery.isLoading}
            onClick={() => syncMut.mutate()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={`h-3 w-3 ${syncMut.isPending ? "animate-spin" : ""}`}
            />
            {syncMut.isPending ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CgSourcesPage() {
  usePageConfig({
    breadcrumbs: [
      { label: "Admin" },
      { label: "Context Graph", to: "/admin/context-graph" },
      { label: "Sources" },
    ],
    topbarChrome: "contentBlend",
  });

  const sourcesQuery = useQuery({
    queryKey: ["context-graph", "sources"],
    queryFn: ({ signal }) => getSources(signal),
    staleTime: 60_000,
  });

  const sources = sourcesQuery.data ?? [];

  return (
    <section className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="space-y-1">
        <h2 className="font-semibold text-base">Data sources</h2>
        <p className="text-muted-foreground text-sm">
          Sync entities and relationships from other modules into the context
          graph.
        </p>
      </div>
      {sourcesQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              className="h-32 animate-pulse rounded-lg border bg-muted"
              key={i}
            />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No sources registered. Modules can register sources via{" "}
          <span className="font-mono">registerContextGraphSource</span>.
        </p>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      )}
    </section>
  );
}
