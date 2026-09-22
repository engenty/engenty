import { useTranslation } from "@engenty/i18n/ui";
import { useMutation } from "@engenty/query-client";
import { Button, Input, Spinner } from "@engenty/ui-core";
import { useEffect, useState } from "react";
import {
  apiErrorMessage,
  importConnector,
  previewSource,
  searchRegistry,
} from "./marketplace-api.js";
import {
  inferSourceKind,
  kebabIdFrom,
  snakePrefixFrom,
} from "./marketplace-model.js";
import { RegistryLogo } from "./marketplace-row.js";

export function MarketplaceImport({
  onImported,
  onOpen,
  query,
  showPaste = true,
}: {
  onImported: (connectorId: string) => void;
  onOpen: (domain: string) => void;
  query: string;
  showPaste?: boolean;
}) {
  const { t } = useTranslation("connections");
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const search = useMutation({
    mutationFn: (value: string) => searchRegistry(value),
  });
  const importing = useMutation({
    mutationFn: async (input: {
      domain: string;
      id: string;
      name: string;
      source_kind: "openapi" | "mcp";
      source_url: string;
      tool_prefix: string;
    }) => {
      const preview = await previewSource({
        domain: input.domain,
        source_kind: input.source_kind,
        source_url: input.source_url,
      });
      if (preview.import_blockers.length > 0) {
        throw new Error(preview.import_blockers.join(" · "));
      }
      return importConnector({
        domain: input.domain,
        id: input.id,
        name: input.name,
        source_kind: input.source_kind,
        source_url: input.source_url,
        tool_prefix: input.tool_prefix,
      });
    },
    onSuccess: (result) => onImported(result.connector.id),
  });

  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 2) {
      return;
    }
    const timer = window.setTimeout(() => {
      search.mutate(trimmed);
    }, 320);
    return () => window.clearTimeout(timer);
    // search.mutate identity is stable enough for debounce-on-query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  const results = trimmed.length >= 2 ? (search.data ?? []) : [];

  const importPasted = () => {
    const url = pasteUrl.trim();
    setPasteError(null);
    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {
      setPasteError(t("marketplace.invalidUrl"));
      return;
    }
    const kind = inferSourceKind(url) ?? "mcp";
    importing.mutate(
      {
        domain: hostname,
        id: kebabIdFrom(hostname),
        name: hostname,
        source_kind: kind,
        source_url: url,
        tool_prefix: snakePrefixFrom(hostname),
      },
      { onError: (error) => setPasteError(apiErrorMessage(error)) }
    );
  };

  return (
    <div className="space-y-3">
      {showPaste ? (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <p className="font-medium text-sm">{t("marketplace.pasteMcp")}</p>
          <p className="text-muted-foreground text-xs">
            {t("marketplace.pasteMcpHint")}
          </p>
          <div className="flex gap-2">
            <Input
              onChange={(event) => setPasteUrl(event.target.value)}
              placeholder="https://…"
              value={pasteUrl}
            />
            <Button
              disabled={importing.isPending || pasteUrl.trim().length === 0}
              onClick={importPasted}
              size="sm"
              type="button"
              variant="outline"
            >
              {importing.isPending ? <Spinner className="size-4" /> : null}
              {t("marketplace.add")}
            </Button>
          </div>
          {pasteError ? (
            <p className="text-destructive text-xs">{pasteError}</p>
          ) : null}
        </div>
      ) : null}
      {trimmed.length >= 2 ? (
        <div className="space-y-2">
          <p className="font-medium text-sm">{t("marketplace.registry")}</p>
          {search.isPending ? (
            <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              {t("marketplace.searchingRegistry")}
            </div>
          ) : null}
          {search.isError ? (
            <p className="text-destructive text-xs">
              {apiErrorMessage(search.error)}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {results.map((result) => (
              <button
                className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-3 text-left hover:bg-accent/40"
                key={result.domain}
                onClick={() => onOpen(result.domain)}
                type="button"
              >
                <RegistryLogo domain={result.domain} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">
                    {result.name}
                  </span>
                  <span className="line-clamp-2 text-muted-foreground text-xs">
                    {result.description || result.domain}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {search.isSuccess && results.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              {t("marketplace.catalogEmpty")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
