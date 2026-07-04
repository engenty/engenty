import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, Card } from "@engenty/ui-core";
import { RotateCcw } from "lucide-react";
import type {
  CatalogAction,
  ConnectionPolicy,
  ConnectionPolicyOverride,
  ConnectorActionGroup,
} from "../api.js";
import {
  actionsInGroup,
  effectiveActionPolicy,
  effectiveGroupPolicy,
  GROUP_ORDER,
  groupSelector,
} from "../lib/policy.js";
import { PolicySelect } from "./policy-select.js";

export interface PermissionsMatrixProps {
  actions: CatalogAction[];
  disabled?: boolean;
  /** `policy: null` clears the override at that selector. */
  onSetPolicy: (selector: string, policy: ConnectionPolicy | null) => void;
  overrides: ConnectionPolicyOverride[];
}

/**
 * Per-connection tool-permission matrix, grouped by action group.
 * Effective state mirrors the backend resolution: action override →
 * group override → group default (`default_policy` on each action).
 */
export function PermissionsMatrix({
  actions,
  disabled,
  onSetPolicy,
  overrides,
}: PermissionsMatrixProps) {
  const { t } = useTranslation("connections");

  const groups = GROUP_ORDER.map((group) => ({
    actions: actionsInGroup(actions, group),
    group,
  })).filter((entry) => entry.actions.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("matrix.noActions")}</p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ actions: groupActions, group }) => (
        <MatrixGroup
          actions={groupActions}
          disabled={disabled}
          group={group}
          key={group}
          onSetPolicy={onSetPolicy}
          overrides={overrides}
        />
      ))}
    </div>
  );
}

function MatrixGroup({
  actions,
  disabled,
  group,
  onSetPolicy,
  overrides,
}: {
  actions: CatalogAction[];
  disabled?: boolean;
  group: ConnectorActionGroup;
  onSetPolicy: (selector: string, policy: ConnectionPolicy | null) => void;
  overrides: ConnectionPolicyOverride[];
}) {
  const { t } = useTranslation("connections");
  // Every action of a group shares the same default policy.
  const defaultPolicy = actions[0]!.default_policy;
  const groupState = effectiveGroupPolicy({ defaultPolicy, group, overrides });

  return (
    <Card className="space-y-0 overflow-hidden" variant="settings">
      <div className="flex items-center gap-2 border-border border-b bg-muted/40 px-4 py-2.5">
        <span className="font-medium text-sm">
          {t(`matrix.groups.${group}`)}
        </span>
        <Badge variant="secondary">{actions.length}</Badge>
        <div className="ml-auto flex items-center gap-1">
          {groupState.overridden ? (
            <ResetButton
              disabled={disabled}
              onClick={() => onSetPolicy(groupSelector(group), null)}
            />
          ) : null}
          <PolicySelect
            disabled={disabled}
            onValueChange={(policy) =>
              onSetPolicy(groupSelector(group), policy)
            }
            value={groupState.policy}
          />
        </div>
      </div>
      <ul className="divide-y divide-border">
        {actions.map((action) => {
          const state = effectiveActionPolicy({ action, overrides });
          return (
            <li className="flex items-center gap-3 px-4 py-2.5" key={action.id}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{action.summary}</span>
                  {state.source === "action" ? (
                    <Badge variant="outline">{t("matrix.customBadge")}</Badge>
                  ) : null}
                </div>
                <p className="truncate text-muted-foreground text-xs">
                  {action.operation_id}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {state.source === "action" ? (
                  <ResetButton
                    disabled={disabled}
                    onClick={() => onSetPolicy(action.id, null)}
                  />
                ) : null}
                <PolicySelect
                  disabled={disabled}
                  onValueChange={(policy) => onSetPolicy(action.id, policy)}
                  value={state.policy}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ResetButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("connections");
  return (
    <Button
      aria-label={t("matrix.reset")}
      disabled={disabled}
      onClick={onClick}
      size="icon-sm"
      title={t("matrix.reset")}
      type="button"
      variant="ghost"
    >
      <RotateCcw className="h-4 w-4" />
    </Button>
  );
}
