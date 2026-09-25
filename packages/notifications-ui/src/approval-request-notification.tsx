// The body under an `approval_requested` record: what the row can DO.
//
// Core's approval gate filed a request for a gated operation an agent wanted
// to run; the person decides it here, in the list, instead of hunting for the
// chat that raised it. The decision goes to core's own route, core emits
// `approval.decided`, and the record resolves on that — the row is never
// "seen" away while the agent stays blocked.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { type ApprovalDecision, isAlreadyDecided } from "./api.js";
import { useDecideApprovalMutation } from "./queries.js";
import {
  type NotificationRendererProps,
  registerNotificationRenderer,
  useNotificationSurface,
} from "./renderers.js";

/** The request id: the row's subject. */
function approvalRequestId(
  notification: NotificationRendererProps["notification"]
): string | null {
  return notification.subject_type === "approval_request"
    ? notification.subject_id
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function ApprovalRequestNotification({
  notification,
}: NotificationRendererProps) {
  const { t } = useTranslation("common");
  const inbox = useNotificationSurface() === "inbox";
  const decide = useDecideApprovalMutation();
  const [chosen, setChosen] = useState<ApprovalDecision | null>(null);
  const requestId = approvalRequestId(notification);
  if (!requestId) {
    return null;
  }
  const moduleId = readString(notification.metadata?.module_id);
  const operationId = readString(notification.metadata?.operation_id);
  const riskLevel = readString(notification.payload?.risk_level);
  const busy = decide.isPending;
  const choose = (decision: ApprovalDecision) => {
    if (busy) {
      return;
    }
    setChosen(decision);
    decide.mutate({ decision, requestId });
  };
  const choices: { decision: ApprovalDecision; label: string }[] = [
    {
      decision: "allow_once",
      label: inbox
        ? t("notifications.approval.allowOnceInbox", {
            defaultValue: "Once",
          })
        : t("notifications.approval.allowOnce", {
            defaultValue: "Allow once",
          }),
    },
    {
      decision: "allow_policy",
      label: inbox
        ? t("notifications.approval.allowAlwaysInbox", {
            defaultValue: "For agent",
          })
        : t("notifications.approval.allowAlways", {
            defaultValue: "Always allow for this agent",
          }),
    },
    {
      decision: "deny",
      label: t("notifications.approval.deny", { defaultValue: "Deny" }),
    },
  ];
  // The row stays until the resolve event lands; once decided it reads as
  // answered rather than still asking.
  const decided = decide.isSuccess && chosen;
  const showMeta = inbox
    ? Boolean(riskLevel)
    : Boolean(moduleId || operationId || riskLevel);
  return (
    <div className="mt-1.5 space-y-1.5">
      {showMeta ? (
        <p className="line-clamp-2 text-muted-foreground text-xs">
          {inbox
            ? t("notifications.approval.risk", {
                defaultValue: "{{level}} risk",
                level: riskLevel,
              })
            : [
                moduleId,
                operationId ? (
                  <code className="font-mono" key="op">
                    {operationId}
                  </code>
                ) : null,
                riskLevel
                  ? t("notifications.approval.risk", {
                      defaultValue: "{{level}} risk",
                      level: riskLevel,
                    })
                  : null,
              ]
                .filter(Boolean)
                .map((part, index) => (
                  <span key={typeof part === "string" ? part : index}>
                    {index > 0 ? " · " : null}
                    {part}
                  </span>
                ))}
        </p>
      ) : null}
      {decided ? (
        <p className="text-muted-foreground text-xs">
          {t("notifications.approval.decided", {
            decision: choices.find((c) => c.decision === chosen)?.label,
            defaultValue: "Decided: {{decision}}",
          })}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {choices.map((choice) => (
            <Button
              className={cn(
                "h-7 gap-1 px-2.5 text-xs",
                choice.decision === "deny" && "text-destructive"
              )}
              disabled={busy}
              key={choice.decision}
              onClick={() => choose(choice.decision)}
              size="sm"
              variant={choice.decision === "allow_once" ? "default" : "ghost"}
            >
              {busy && chosen === choice.decision ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              {choice.label}
            </Button>
          ))}
          {decide.isError ? (
            <span
              className={cn(
                "text-xs",
                isAlreadyDecided(decide.error)
                  ? "text-muted-foreground"
                  : "text-destructive"
              )}
            >
              {isAlreadyDecided(decide.error)
                ? t("notifications.approval.alreadyDecided", {
                    defaultValue: "Already handled by someone else.",
                  })
                : t("notifications.approval.failed", {
                    defaultValue: "Could not record the decision.",
                  })}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Kinds this body answers. */
export const APPROVAL_REQUEST_KINDS = ["approval_requested"] as const;

/**
 * The package owns this kind, so it registers the body itself (a module
 * registers bodies for its own kinds the same way). Idempotent per kind.
 */
export function registerApprovalRequestRenderer(): () => void {
  const undo = APPROVAL_REQUEST_KINDS.map((kind) =>
    registerNotificationRenderer(kind, ApprovalRequestNotification)
  );
  return () => {
    for (const fn of undo) {
      fn();
    }
  };
}

registerApprovalRequestRenderer();
