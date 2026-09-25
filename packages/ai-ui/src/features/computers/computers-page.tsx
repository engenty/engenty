"use client";

// Every live computer, in one place — rule 5 of the compute plan made
// visible: no long-lived process without a row a person can see and kill.
//
// Rows are run sandboxes (transient by design; a session-lifecycle container
// outliving its chat is exactly what this page exists to catch). The strip on
// top is the host's admission picture — held / limit / queued — because "my
// run is waiting" is a fact about the host, and this is where to see it.
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Badge, Button, Skeleton } from "@engenty/ui-core";
import { Cpu, Pause, RefreshCw, Trash2 } from "lucide-react";
import {
  killComputers,
  listComputers,
  stopComputers,
} from "./computers-api.js";

const computersKeys = { list: ["computers", "list"] as const };

function age(createdAtMs: number | null): string {
  if (!createdAtMs) {
    return "—";
  }
  const minutes = Math.floor((Date.now() - createdAtMs) / 60_000);
  if (minutes < 1) {
    return "<1m";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 48
    ? `${hours}h ${minutes % 60}m`
    : `${Math.floor(hours / 24)}d`;
}

function size(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function ComputersPage() {
  const queryClient = useQueryClient();
  const computers = useQuery({
    queryFn: ({ signal }) => listComputers(signal),
    queryKey: computersKeys.list,
    refetchInterval: 10_000,
  });
  const kill = useMutation({
    mutationFn: (sandboxId: string) => killComputers([sandboxId]),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: computersKeys.list }),
  });
  const stop = useMutation({
    mutationFn: (sandboxId: string) => stopComputers([sandboxId]),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: computersKeys.list }),
  });

  const compute = computers.data?.compute;
  const rows = computers.data?.sandboxes ?? [];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-page py-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-semibold text-lg">
            <Cpu aria-hidden className="size-4.5" />
            Computers
          </h1>
          <p className="text-muted-foreground text-sm">
            Every live sandbox on this host. A run's computer is destroyed when
            its run ends — anything old here is worth a look.
          </p>
        </div>
        {compute ? (
          <div className="flex items-center gap-2 text-sm">
            <Badge
              variant={
                compute.held >= compute.limit ? "destructive" : "secondary"
              }
            >
              {compute.held} / {compute.limit} slots
            </Badge>
            {compute.queued > 0 ? (
              <Badge variant="outline">{compute.queued} waiting</Badge>
            ) : null}
          </div>
        ) : null}
        <Button
          aria-label="Refresh"
          className="h-8 w-8 p-0"
          onClick={() => void computers.refetch()}
          size="sm"
          variant="ghost"
        >
          <RefreshCw aria-hidden className="size-3.5" />
        </Button>
      </header>

      {computers.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
          No computer is running. Sandboxes appear here from the first command a
          run executes until the run ends.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground text-xs">
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Lifecycle</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Disk</th>
                <th className="px-3 py-2 font-medium">Container</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-b last:border-b-0" key={row.sandbox_id}>
                  <td className="px-3 py-2">
                    <span className="font-medium">
                      {row.lifecycle === "space"
                        ? "Space computer"
                        : row.lifecycle === "browser"
                          ? "Space browser"
                          : (row.agent_id ?? "unknown")}
                    </span>
                    {row.lifecycle === "browser" && row.space_id ? (
                      <span className="ml-2 font-mono text-muted-foreground text-xs">
                        {row.space_id.slice(0, 8)}
                      </span>
                    ) : null}
                    {row.title ? (
                      <span className="ml-2 text-muted-foreground text-xs">
                        {row.title}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{row.lifecycle}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {row.state}
                    {(compute?.machine_queues?.[row.sandbox_id] ?? 0) > 0 ? (
                      <Badge className="ml-2" variant="outline">
                        {compute?.machine_queues?.[row.sandbox_id]} waiting
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {age(row.created_at_ms)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.drive ? (
                      <span
                        title={`Space folder on the host; quota ${size(row.drive.max_bytes)}`}
                      >
                        {size(row.drive.bytes)}
                        {row.drive.bytes > row.drive.max_bytes ? (
                          <Badge className="ml-2" variant="destructive">
                            over quota
                          </Badge>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-56 truncate px-3 py-2 font-mono text-muted-foreground text-xs">
                    {row.container_name}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(row.lifecycle === "space" ||
                      row.lifecycle === "browser") &&
                    row.state === "running" ? (
                      <Button
                        aria-label={`Stop ${row.container_name}`}
                        className="h-7 px-2 text-xs"
                        disabled={stop.isPending}
                        onClick={() => stop.mutate(row.sandbox_id)}
                        size="sm"
                        variant="ghost"
                      >
                        <Pause aria-hidden className="mr-1 size-3" />
                        Stop
                      </Button>
                    ) : null}
                    <Button
                      aria-label={`${row.lifecycle === "space" || row.lifecycle === "browser" ? "Reset" : "Kill"} ${row.container_name}`}
                      className="h-7 px-2 text-xs"
                      disabled={kill.isPending}
                      onClick={() => kill.mutate(row.sandbox_id)}
                      size="sm"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden className="mr-1 size-3" />
                      {row.lifecycle === "space" || row.lifecycle === "browser"
                        ? "Reset"
                        : "Kill"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {kill.isError ? (
        <p className="mt-2 text-destructive text-xs">
          {kill.error instanceof Error
            ? kill.error.message
            : "Could not destroy that sandbox."}
        </p>
      ) : null}
    </div>
  );
}
