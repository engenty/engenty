"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { RefreshCw } from "lucide-react";
import { useDocConverterAvailabilityQuery } from "../lib/admin/ai-settings-queries.js";
import { extractedMarkdownSidecarKey } from "../lib/extracted-markdown-sidecar.js";
import {
  type ReparseEngine,
  reparseWorkFile,
} from "../lib/reparse-work-file.js";

export function workFileExtractedMarkdownQueryKey(storageKey: string) {
  return [
    "work-files",
    "extracted-markdown",
    extractedMarkdownSidecarKey(storageKey),
  ] as const;
}

export function WorkFileReparseMenu({
  filename,
  onError,
  onFinished,
  onStarted,
  storageKey,
}: {
  filename: string;
  onError?: (message: string | null) => void;
  onFinished?: () => void;
  onStarted?: () => void;
  storageKey: string;
}) {
  const { t } = useTranslation("ai-ui");
  const queryClient = useQueryClient();
  const availability = useDocConverterAvailabilityQuery();
  const mutation = useMutation({
    mutationFn: (engine: ReparseEngine) =>
      reparseWorkFile({ engine, filename, storageKey }),
    onError: (error: unknown) => {
      onError?.(
        error instanceof Error && error.message === "reparse_empty"
          ? t("workPanel.reparseEmpty")
          : t("workPanel.reparseFailed")
      );
    },
    onMutate: () => {
      onError?.(null);
      onStarted?.();
    },
    onSettled: () => {
      onFinished?.();
    },
    onSuccess: async () => {
      onError?.(null);
      await queryClient.invalidateQueries({
        queryKey: workFileExtractedMarkdownQueryKey(storageKey),
      });
    },
  });

  const run = (engine: ReparseEngine) => {
    if (mutation.isPending) {
      return;
    }
    mutation.mutate(engine);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("workPanel.reparse")}
          disabled={mutation.isPending}
          size="icon-sm"
          title={t("workPanel.reparse")}
          type="button"
          variant="ghost"
        >
          <RefreshCw
            aria-hidden
            className={
              mutation.isPending ? "size-3.5 animate-spin" : "size-3.5"
            }
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("workPanel.reparseBrowser")}</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={mutation.isPending}
          onSelect={() => run("anydoc")}
        >
          {t("docConverter.browserParseAnydoc")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={mutation.isPending}
          onSelect={() => run("liteparse-wasm")}
        >
          {t("docConverter.browserParseLiteParse")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("workPanel.reparseServer")}</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={mutation.isPending}
          onSelect={() => run("local")}
        >
          {t("docConverter.providerLocal")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={mutation.isPending}
          onSelect={() => run("liteparse")}
        >
          {t("docConverter.providerLiteParseLocal")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={
            mutation.isPending || availability.data?.llamaparse === false
          }
          onSelect={() => run("llamaparse")}
        >
          {t("docConverter.providerLlamaParse")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={mutation.isPending || availability.data?.mistral === false}
          onSelect={() => run("mistral")}
        >
          {t("docConverter.providerMistral")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={mutation.isPending || availability.data?.gemini === false}
          onSelect={() => run("gemini")}
        >
          {t("docConverter.providerGemini")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
