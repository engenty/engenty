// Browse an external skill registry (skills.sh and other registered providers)
// and install a skill into the tenant's editable `custom` tier. Search + install
// run through the admin AI runtime queries so the skills catalog refreshes after
// an install.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Check, Download, Loader2, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAiSkillRegistryProvidersQuery,
  useAiSkillRegistrySearchQuery,
  useInstallAiSkillMutation,
} from "../../lib/admin/ai-runtime-queries";
import type { SkillRegistrySearchResult } from "../../lib/runtime/skills-api";

export interface InstallSkillModalProps {
  existingSkillNames: ReadonlySet<string>;
  onInstalled: (skillName: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [delayMs, value]);
  return debounced;
}

export function InstallSkillModal({
  existingSkillNames,
  onInstalled,
  onOpenChange,
  open,
}: InstallSkillModalProps) {
  const { t } = useTranslation("ai-ui");
  const providersQuery = useAiSkillRegistryProvidersQuery(open);
  const providers = providersQuery.data?.providers ?? [];
  const [provider, setProvider] = useState("");
  const [query, setQuery] = useState("");
  const [installingRef, setInstallingRef] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const installMutation = useInstallAiSkillMutation();
  const selectedProvider = provider || (providers[0]?.id ?? "");

  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searchEnabled = open && debouncedQuery.length > 0;
  const searchQuery = useAiSkillRegistrySearchQuery(
    selectedProvider || null,
    debouncedQuery,
    searchEnabled
  );
  const results = searchQuery.data?.results ?? [];
  const isDebouncing = query.trim() !== debouncedQuery;

  const reset = useCallback(() => {
    setQuery("");
    setInstallingRef(null);
    setLocalError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        reset();
      }
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const handleInstall = useCallback(
    async (result: SkillRegistrySearchResult) => {
      if (!selectedProvider) {
        return;
      }
      setLocalError(null);
      setInstallingRef(result.ref.id);
      try {
        const installed = await installMutation.mutateAsync({
          provider: selectedProvider,
          ref: { id: result.ref.id },
        });
        reset();
        onInstalled(installed.skill.name);
        onOpenChange(false);
      } catch (error) {
        setLocalError(
          error instanceof Error
            ? error.message
            : t("skillsInstallModal.installFailed")
        );
      } finally {
        setInstallingRef(null);
      }
    },
    [installMutation, onInstalled, onOpenChange, reset, selectedProvider, t]
  );

  const providerPlaceholder = useMemo(
    () => providers.find((entry) => entry.id === selectedProvider)?.label ?? "",
    [providers, selectedProvider]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="bg-background sm:max-w-lg">
        <DialogHeader className="space-y-1">
          <DialogTitle>{t("skillsInstallModal.title")}</DialogTitle>
          <DialogDescription>
            {t("skillsInstallModal.a11yDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="flex items-center gap-2">
            <Select
              disabled={providers.length === 0}
              onValueChange={setProvider}
              value={selectedProvider}
            >
              <SelectTrigger className="h-9 w-40 shrink-0 text-sm">
                <SelectValue placeholder={providerPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {providers.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("skillsInstallModal.searchPlaceholder")}
                autoFocus
                className="h-9 w-full pr-3 pl-8 text-sm"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("skillsInstallModal.searchPlaceholder")}
                value={query}
              />
            </div>
          </div>

          <div className="max-h-[22rem] min-h-40 overflow-y-auto rounded-md border bg-card/40">
            <InstallSkillResults
              debouncing={isDebouncing}
              existingSkillNames={existingSkillNames}
              hasProviders={providers.length > 0}
              installingRef={installingRef}
              isError={searchQuery.isError}
              isLoading={searchQuery.isLoading && searchEnabled}
              onInstall={handleInstall}
              onOpen={(name) => {
                onInstalled(name);
                onOpenChange(false);
              }}
              query={debouncedQuery}
              results={results}
            />
          </div>

          {localError ? (
            <p className="text-destructive text-sm" role="alert">
              {localError}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InstallSkillResults(props: {
  debouncing: boolean;
  existingSkillNames: ReadonlySet<string>;
  hasProviders: boolean;
  installingRef: string | null;
  isError: boolean;
  isLoading: boolean;
  onInstall: (result: SkillRegistrySearchResult) => void;
  onOpen: (skillName: string) => void;
  query: string;
  results: SkillRegistrySearchResult[];
}) {
  const { t } = useTranslation("ai-ui");

  if (!props.hasProviders) {
    return (
      <ResultsMessage>{t("skillsInstallModal.noProviders")}</ResultsMessage>
    );
  }
  if (!props.query) {
    return (
      <ResultsMessage>{t("skillsInstallModal.searchHint")}</ResultsMessage>
    );
  }
  if (props.isLoading || props.debouncing) {
    return (
      <ResultsMessage>
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {t("skillsInstallModal.searching")}
      </ResultsMessage>
    );
  }
  if (props.isError) {
    return (
      <ResultsMessage tone="danger">
        {t("skillsInstallModal.searchFailed")}
      </ResultsMessage>
    );
  }
  if (props.results.length === 0) {
    return (
      <ResultsMessage>
        {t("skillsInstallModal.noResults", { query: props.query })}
      </ResultsMessage>
    );
  }

  return (
    <ul className="divide-y">
      {props.results.map((result) => {
        const installed = props.existingSkillNames.has(result.name);
        const installing = props.installingRef === result.ref.id;
        return (
          <li
            className="flex items-start gap-3 px-3 py-2.5"
            key={result.ref.id}
          >
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate font-medium text-foreground text-sm">
                  {result.name}
                </span>
                {result.version ? (
                  <span className="shrink-0 font-mono text-muted-foreground text-xs">
                    {t("skillsInstallModal.version", {
                      version: result.version,
                    })}
                  </span>
                ) : null}
              </div>
              {result.description ? (
                <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                  {result.description}
                </p>
              ) : null}
              {result.tags && result.tags.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.tags.slice(0, 4).map((tag) => (
                    <Badge
                      className="border-border bg-card font-normal text-[10px] text-muted-foreground"
                      key={tag}
                      variant="outline"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
            {installed ? (
              <Button
                className="shrink-0 gap-1.5"
                onClick={() => props.onOpen(result.name)}
                size="xs"
                type="button"
                variant="outline"
              >
                <Check aria-hidden className="size-3.5" />
                {t("skillsInstallModal.installed")}
              </Button>
            ) : (
              <Button
                className="shrink-0 gap-1.5"
                disabled={installing || Boolean(props.installingRef)}
                onClick={() => props.onInstall(result)}
                size="xs"
                type="button"
              >
                {installing ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <Download aria-hidden className="size-3.5" />
                )}
                {installing
                  ? t("skillsInstallModal.installing")
                  : t("skillsInstallModal.install")}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ResultsMessage(props: {
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-10 text-center text-sm",
        props.tone === "danger" ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {props.children}
    </div>
  );
}
