/**
 * Connection-level tool permissions for a connected folder, in a compact sheet.
 */
import type { ConnectionPolicy } from "@engenty/connections/ui/api";
import {
  actionsInGroup,
  effectiveActionPolicy,
  effectiveGroupPolicy,
  GROUP_ORDER,
  groupSelector,
} from "@engenty/connections/ui/lib/policy";
import {
  connectionsCatalogOptions,
  useSetConnectionPolicyMutation,
} from "@engenty/connections/ui/queries";
import type { DriveNode } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@engenty/ui-core";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  fileSpaceFactsFromNode,
  useFileSpaceNodeFacts,
} from "./file-space-node-facts";

const POLICIES: ConnectionPolicy[] = ["allow", "ask", "deny"];

function PolicyControl({
  disabled,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  onValueChange: (policy: ConnectionPolicy) => void;
  value: ConnectionPolicy;
}) {
  const { t } = useTranslation("connections");
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) => onValueChange(next as ConnectionPolicy)}
      value={value}
    >
      <SelectTrigger className="h-7 w-34 px-2 text-xs" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {POLICIES.map((policy) => (
          <SelectItem key={policy} value={policy}>
            {t(`policy.${policy}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function NodePermissionsDialog({
  node,
  onOpenChange,
  open,
  spaceId,
}: {
  node: DriveNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  spaceId: string | null;
}) {
  const { t } = useTranslation("common");
  const { t: tc } = useTranslation("connections");
  const factsQuery = useFileSpaceNodeFacts(node, spaceId, open);
  const catalogQuery = useQuery({
    ...connectionsCatalogOptions(),
    enabled: open,
  });
  const setPolicy = useSetConnectionPolicyMutation();
  const connectionId =
    factsQuery.data?.connectionId ?? fileSpaceFactsFromNode(node).connectionId;

  const match = useMemo(() => {
    if (!connectionId) {
      return null;
    }
    for (const connector of catalogQuery.data?.connectors ?? []) {
      const connection = connector.connections.find(
        (row) => row.id === connectionId
      );
      if (connection) {
        return { connection, connector };
      }
    }
    return null;
  }, [catalogQuery.data, connectionId]);

  const pending =
    catalogQuery.isPending || (factsQuery.isPending && !connectionId);
  const label =
    match?.connection.display_name ??
    match?.connection.external_account ??
    match?.connector.name ??
    node.name;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[24rem]">
        <DialogHeader className="border-border border-b px-4 py-3">
          <DialogTitle className="text-sm">
            {t("spaces.data.permissions", { defaultValue: "Permissions" })}
          </DialogTitle>
          <DialogDescription className="text-xs">{label}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto px-4 py-3">
          {pending ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Spinner className="size-3.5" />
              {t("spaces.data.loading")}
            </div>
          ) : match ? (
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs">
                {tc("settings.autonomousMode")}:{" "}
                {tc(`settings.autonomous.${match.connection.autonomous_mode}`)}
              </p>
              {GROUP_ORDER.map((group) => {
                const actions = actionsInGroup(match.connector.actions, group);
                if (actions.length === 0) {
                  return null;
                }
                const defaultPolicy = actions[0]!.default_policy;
                const groupState = effectiveGroupPolicy({
                  defaultPolicy,
                  group,
                  overrides: match.connection.policies,
                });
                return (
                  <div key={group}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-medium text-xs">
                        {tc(`matrix.groups.${group}`)}
                      </p>
                      <PolicyControl
                        disabled={setPolicy.isPending}
                        onValueChange={(policy) => {
                          setPolicy.mutate(
                            {
                              connection_id: match.connection.id,
                              policy,
                              selector: groupSelector(group),
                            },
                            {
                              onError: (error) => {
                                toast.error(
                                  tc("toasts.policySaveFailed", {
                                    error: error.message,
                                  })
                                );
                              },
                            }
                          );
                        }}
                        value={groupState.policy}
                      />
                    </div>
                    <ul className="space-y-1">
                      {actions.map((action) => {
                        const state = effectiveActionPolicy({
                          action,
                          overrides: match.connection.policies,
                        });
                        return (
                          <li
                            className="flex items-center justify-between gap-2 py-0.5"
                            key={action.id}
                          >
                            <span className="min-w-0 truncate text-xs">
                              {action.summary}
                            </span>
                            <PolicyControl
                              disabled={setPolicy.isPending}
                              onValueChange={(policy) => {
                                setPolicy.mutate(
                                  {
                                    connection_id: match.connection.id,
                                    policy,
                                    selector: action.id,
                                  },
                                  {
                                    onError: (error) => {
                                      toast.error(
                                        tc("toasts.policySaveFailed", {
                                          error: error.message,
                                        })
                                      );
                                    },
                                  }
                                );
                              }}
                              value={state.policy}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              {t("spaces.data.info.noConnection", {
                defaultValue: "This folder is not linked to a connection.",
              })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
