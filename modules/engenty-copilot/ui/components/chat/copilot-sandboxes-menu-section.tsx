import { useCopilotThreadBinding, useEngentyAIContext } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  cn,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@engenty/ui-core";
import { Box } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  type AgentSandboxDto,
  destroyAgentSandboxes,
  listAgentSandboxes,
} from "../../../src/lib/agent-sandboxes-client.js";
import { formatCopilotSessionShortId } from "../../../src/lib/session-label.js";
import { copilotChatThreadPath } from "../../paths.js";

export function agentSandboxesQueryKey(input: {
  tenantId: string;
  userId: string;
}) {
  return [
    "engenty-copilot",
    "agent-sandboxes",
    input.tenantId,
    input.userId,
  ] as const;
}

function sandboxMenuLabel(
  sandbox: AgentSandboxDto,
  untitledLabel: (shortId: string) => string
): string {
  const title = sandbox.title?.trim();
  if (title) {
    return title;
  }
  const threadId = sandbox.thread_id?.trim();
  if (threadId) {
    return untitledLabel(formatCopilotSessionShortId(threadId));
  }
  return sandbox.container_name || sandbox.sandbox_id;
}

export function CopilotSandboxesMenuSection(props: {
  deletePending?: boolean;
  menuItemClassName?: string;
}) {
  const { t } = useTranslation("engenty-copilot");
  const binding = useCopilotThreadBinding();
  const { isTransportReady, serviceBaseUrl } = useEngentyAIContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () =>
      agentSandboxesQueryKey({
        tenantId: binding.tenantId,
        userId: binding.userId,
      }),
    [binding.tenantId, binding.userId]
  );
  const sandboxesQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      listAgentSandboxes({
        serviceBaseUrl,
        signal,
        tenantId: binding.tenantId,
        userId: binding.userId,
      }),
    enabled: isTransportReady && serviceBaseUrl.length > 0,
    refetchInterval: 15_000,
  });
  const killAllMutation = useMutation({
    mutationFn: () =>
      destroyAgentSandboxes({
        serviceBaseUrl,
        tenantId: binding.tenantId,
        userId: binding.userId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const runningSandboxes = sandboxesQuery.data ?? [];
  const runningCount = runningSandboxes.length;
  const untitledLabel = useCallback(
    (shortId: string) =>
      t("chat.untitledSession", {
        shortId,
      }),
    [t]
  );
  const itemClassName = props.menuItemClassName ?? "";

  if (!isTransportReady) {
    return null;
  }

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className={itemClassName}>
          <Box className="size-3.5" />
          {runningCount > 0
            ? t("chat.sandboxesRunning", { count: runningCount })
            : t("chat.sandboxesNone")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-44">
          {runningCount === 0 ? (
            <DropdownMenuItem className={itemClassName} disabled>
              {t("chat.sandboxesNone")}
            </DropdownMenuItem>
          ) : (
            <>
              {runningSandboxes.map((sandbox) => {
                const threadId = sandbox.thread_id?.trim();
                const label = sandboxMenuLabel(sandbox, untitledLabel);
                return (
                  <DropdownMenuItem
                    className={itemClassName}
                    disabled={!threadId}
                    key={sandbox.sandbox_id}
                    onClick={() => {
                      if (!threadId) {
                        return;
                      }
                      navigate(copilotChatThreadPath(threadId));
                    }}
                  >
                    {label}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={cn(
                  itemClassName,
                  "text-destructive focus:text-destructive"
                )}
                disabled={killAllMutation.isPending || props.deletePending}
                onClick={() => killAllMutation.mutate()}
              >
                {t("chat.sandboxesKillAll")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  );
}
