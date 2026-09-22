import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Spinner,
  Switch,
  TableCell,
  TableRow,
} from "@engenty/ui-core";
import { RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ImportedConnector } from "../api.js";
import { apiErrorMessage } from "../api.js";
import {
  useDeleteConnectorMutation,
  useRefreshConnectorMutation,
  useSetConnectorStatusMutation,
} from "../queries.js";

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function KindBadge({ kind }: { kind: string }) {
  return <Badge variant="outline">{kind}</Badge>;
}

export function ImportedConnectorRow({
  connector,
}: {
  connector: ImportedConnector;
}) {
  const refresh = useRefreshConnectorMutation();
  const setStatus = useSetConnectorStatusMutation();
  const remove = useDeleteConnectorMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRefresh = () => {
    refresh.mutate(connector.id, {
      onError: (error) => {
        toast.error(`Refresh failed: ${apiErrorMessage(error)}`);
      },
      onSuccess: (result) => {
        const summary = `${result.added.length} added, ${result.removed.length} removed`;
        if (result.restart_recommended) {
          toast.warning(`Refreshed ${connector.id}: ${summary}`, {
            description:
              "Removed actions fully settle on the next core restart.",
          });
        } else {
          toast.success(`Refreshed ${connector.id}: ${summary}`);
        }
        if (result.skipped_actions.length > 0) {
          toast.warning(
            `${result.skipped_actions.length} action(s) skipped at registration: ${result.skipped_actions.join(", ")}`
          );
        }
      },
    });
  };

  const handleStatusChange = (enabled: boolean) => {
    const status = enabled ? ("enabled" as const) : ("disabled" as const);
    setStatus.mutate(
      { id: connector.id, status },
      {
        onError: (error) => {
          toast.error(`Status change failed: ${apiErrorMessage(error)}`);
        },
        onSuccess: () => {
          toast.success(`${connector.id} ${status}`);
        },
      }
    );
  };

  const handleDelete = () => {
    remove.mutate(connector.id, {
      onError: (error) => {
        toast.error(`Delete failed: ${apiErrorMessage(error)}`);
      },
      onSuccess: () => {
        toast.success(`Deleted ${connector.id}`, {
          description: "A core restart is recommended to drop its operations.",
        });
      },
    });
  };

  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <div className="font-medium">{connector.name}</div>
          <div className="text-muted-foreground text-xs">
            {connector.id} · {connector.tool_prefix}_*
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[180px] truncate">
        {connector.domain}
      </TableCell>
      <TableCell>
        <KindBadge kind={connector.source_kind} />
      </TableCell>
      <TableCell>{connector.action_count}</TableCell>
      <TableCell>
        {connector.has_oauth_client ? (
          <Badge variant="secondary">configured</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatTimestamp(connector.refreshed_at ?? connector.imported_at)}
      </TableCell>
      <TableCell>
        <Switch
          aria-label={`Enable ${connector.id}`}
          checked={connector.status === "enabled"}
          disabled={setStatus.isPending}
          onCheckedChange={handleStatusChange}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            aria-label={`Refresh ${connector.id}`}
            disabled={refresh.isPending}
            onClick={handleRefresh}
            size="sm"
            type="button"
            variant="ghost"
          >
            {refresh.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
          <Button
            aria-label={`Delete ${connector.id}`}
            disabled={remove.isPending}
            onClick={() => setConfirmDelete(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{connector.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Removes this tenant install and its {connector.action_count}{" "}
                action(s). Existing connections to it stop working. This cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
