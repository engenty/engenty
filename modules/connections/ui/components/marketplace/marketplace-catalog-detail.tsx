import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery } from "@engenty/query-client";
import { Button, Spinner } from "@engenty/ui-core";
import { Check } from "lucide-react";
import {
  apiErrorMessage,
  importConnector,
  loadRegistryDomain,
} from "./marketplace-api.js";
import {
  kebabIdFrom,
  type MarketplacePlugin,
  snakePrefixFrom,
} from "./marketplace-model.js";
import { RegistryLogo } from "./marketplace-row.js";

const KIND_LABEL: Record<string, string> = {
  cli: "CLI",
  graphql: "GraphQL",
  http: "REST",
  mcp: "MCP",
  openapi: "REST",
};

function plainText(value: string): string {
  return value
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function authLabel(type: string): string {
  if (type === "oauth2" || type === "oauth") {
    return "OAuth";
  }
  if (type === "bearer" || type === "api_key") {
    return "API token";
  }
  return type;
}

export function MarketplaceCatalogDetail({
  domain,
  installed,
  onImported,
  onOpen,
}: {
  domain: string;
  installed: readonly MarketplacePlugin[];
  onImported: (connectorId: string) => void;
  onOpen: (connectorId: string) => void;
}) {
  const { t } = useTranslation("connections");
  const page = useQuery({
    queryFn: ({ signal }) => loadRegistryDomain(domain, signal),
    queryKey: ["external-connectors", "domain", domain],
  });
  const importing = useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      source_kind: "openapi" | "mcp";
      source_url: string;
      tool_prefix: string;
    }) => importConnector({ domain, ...input }),
    onError: (error, variables) => {
      if (/already imported/i.test(apiErrorMessage(error))) {
        onOpen(variables.id);
      }
    },
    onSuccess: (result) => onImported(result.connector.id),
  });
  const data = page.data;
  const description = data?.description || data?.summary || domain;
  const sources = data?.sources ?? [];
  const credentials = data?.credentials ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <RegistryLogo className="size-10" domain={domain} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-base">{domain}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {page.isPending ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner className="size-4" />
          {t("marketplace.searchingRegistry")}
        </div>
      ) : null}
      {page.isError ? (
        <p className="text-destructive text-xs">
          {apiErrorMessage(page.error)}
        </p>
      ) : null}
      {data?.summary && data.description ? (
        <p className="text-muted-foreground text-sm">{data.summary}</p>
      ) : null}
      {sources.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">
            {t("marketplace.sectionIntegrations", {
              count: sources.length,
            })}
          </h3>
          {sources.map((source) => {
            const id = kebabIdFrom(source.surface.slug);
            const existing = installed.find((plugin) => plugin.id === id);
            const canAdd =
              !existing &&
              Boolean(source.source_url) &&
              source.blocked_reason === null;
            const name = source.surface.name || source.surface.slug;
            const openExisting = existing
              ? () => onOpen(existing.id)
              : undefined;
            return (
              <div
                className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3"
                key={source.surface.slug}
              >
                {openExisting ? (
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={openExisting}
                    type="button"
                  >
                    <p className="truncate font-medium text-sm">{name}</p>
                    <p className="text-muted-foreground text-xs">
                      {KIND_LABEL[source.surface.kind] ?? source.surface.kind}
                    </p>
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{name}</p>
                    <p className="text-muted-foreground text-xs">
                      {KIND_LABEL[source.surface.kind] ?? source.surface.kind}
                    </p>
                  </div>
                )}
                {existing ? (
                  <button
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-700 text-xs dark:text-emerald-400"
                    onClick={openExisting}
                    type="button"
                  >
                    <Check className="size-3.5" />
                    {t("marketplace.installed")}
                  </button>
                ) : canAdd ? (
                  <Button
                    disabled={importing.isPending}
                    onClick={() =>
                      importing.mutate({
                        id,
                        name,
                        source_kind: source.source_kind,
                        source_url: source.source_url,
                        tool_prefix: snakePrefixFrom(source.surface.slug),
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("marketplace.add")}
                  </Button>
                ) : null}
              </div>
            );
          })}
          {importing.error &&
          !/already imported/i.test(apiErrorMessage(importing.error)) ? (
            <p className="text-destructive text-xs">
              {apiErrorMessage(importing.error)}
            </p>
          ) : null}
        </section>
      ) : null}
      {credentials.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">
            {t("marketplace.sectionSignIn")}
          </h3>
          {credentials.map((credential) => (
            <div
              className="rounded-xl border bg-card p-3"
              key={`${credential.type}:${credential.label}`}
            >
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-medium text-sm">
                  {credential.label}
                </p>
                <span className="text-muted-foreground text-xs">
                  {authLabel(credential.type)}
                </span>
                {credential.generate_url ? (
                  <a
                    className="text-xs underline"
                    href={credential.generate_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("marketplace.getToken")}
                  </a>
                ) : null}
              </div>
              {credential.setup ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  {plainText(credential.setup)}
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
