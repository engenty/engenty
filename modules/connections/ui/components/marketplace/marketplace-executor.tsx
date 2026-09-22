import { useTranslation } from "@engenty/i18n/ui";
import { useMutation } from "@engenty/query-client";
import { Button, Spinner } from "@engenty/ui-core";
import { Cable } from "lucide-react";
import { apiErrorMessage, importConnector } from "./marketplace-api.js";
import {
  kebabIdFrom,
  type MarketplacePlugin,
  snakePrefixFrom,
} from "./marketplace-model.js";
import { RegistryLogo } from "./marketplace-row.js";

/** Dialog details id for the Executor launcher. Not a connector id. */
export const EXECUTOR_DETAILS_ID = "special:executor";

const EXECUTOR_DOMAIN = "executor.sh";
const EXECUTOR_MCP_URL = "https://executor.sh/mcp";
const EXECUTOR_SLUG = "executor-mcp";

export function findExecutorPlugin(
  plugins: readonly MarketplacePlugin[]
): MarketplacePlugin | undefined {
  const id = kebabIdFrom(EXECUTOR_SLUG);
  return plugins.find((plugin) => plugin.id === id || plugin.id === "executor");
}

export function MarketplaceSpecialCards({
  onOpenExecutor,
  onOpenMcp,
}: {
  onOpenExecutor: () => void;
  onOpenMcp: () => void;
}) {
  const { t } = useTranslation("connections");
  return (
    <>
      <button
        className="flex min-w-0 items-start gap-3 rounded-xl border border-dashed bg-card p-3 text-left hover:bg-accent/40"
        onClick={onOpenMcp}
        type="button"
      >
        <Cable className="size-8 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block font-medium text-sm">
            {t("marketplace.filterMcp")}
          </span>
          <span className="line-clamp-2 text-muted-foreground text-xs">
            {t("marketplace.mcpCardHint")}
          </span>
        </span>
      </button>
      <button
        className="flex min-w-0 items-start gap-3 rounded-xl border border-dashed bg-card p-3 text-left hover:bg-accent/40"
        onClick={onOpenExecutor}
        type="button"
      >
        <RegistryLogo domain={EXECUTOR_DOMAIN} />
        <span className="min-w-0">
          <span className="block font-medium text-sm">Executor</span>
          <span className="line-clamp-2 text-muted-foreground text-xs">
            {t("marketplace.executorCardHint")}
          </span>
        </span>
      </button>
    </>
  );
}

export function MarketplaceExecutor({
  installed,
  onImported,
  onOpen,
}: {
  installed: readonly MarketplacePlugin[];
  onImported: (connectorId: string) => void;
  onOpen: (connectorId: string) => void;
}) {
  const { t } = useTranslation("connections");
  const existing = findExecutorPlugin(installed);
  const id = kebabIdFrom(EXECUTOR_SLUG);
  const importing = useMutation({
    mutationFn: () =>
      importConnector({
        domain: EXECUTOR_DOMAIN,
        id,
        name: "Executor",
        source_kind: "mcp",
        source_url: EXECUTOR_MCP_URL,
        tool_prefix: snakePrefixFrom(EXECUTOR_SLUG),
      }),
    onError: (error) => {
      if (/already imported/i.test(apiErrorMessage(error))) {
        onOpen(id);
      }
    },
    onSuccess: (result) => onImported(result.connector.id),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <RegistryLogo className="size-10" domain={EXECUTOR_DOMAIN} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-base">Executor</h2>
          <p className="text-muted-foreground text-sm">
            {t("marketplace.executorLead")}
          </p>
        </div>
        {existing ? (
          <Button onClick={() => onOpen(existing.id)} type="button">
            {t("marketplace.details")}
          </Button>
        ) : (
          <Button
            disabled={importing.isPending}
            onClick={() => importing.mutate()}
            type="button"
          >
            {importing.isPending ? <Spinner className="size-4" /> : null}
            {t("marketplace.add")}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        {t("marketplace.executorNote")}
      </p>
      <p className="font-mono text-muted-foreground text-xs">
        {EXECUTOR_MCP_URL}
      </p>
      <a
        className="text-sm underline"
        href="https://executor.sh/docs/mcp-proxy"
        rel="noreferrer"
        target="_blank"
      >
        {t("marketplace.executorDocs")}
      </a>
      {importing.error &&
      !/already imported/i.test(apiErrorMessage(importing.error)) ? (
        <p className="text-destructive text-xs">
          {apiErrorMessage(importing.error)}
        </p>
      ) : null}
    </div>
  );
}
