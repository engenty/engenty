// Marketplace panel for the agent Skills tab: search skills.sh via the
// existing registry hooks and install without closing the Extensions dialog.

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Check, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  useAiSkillRegistryProvidersQuery,
  useAiSkillRegistrySearchQuery,
  useInstallAiSkillMutation,
} from "../../lib/admin/ai-runtime-queries.js";
import type { SkillRegistrySearchResult } from "../../lib/runtime/skills-api.js";

const FEATURED_SKILLS = [
  { name: "frontend-design", source: "anthropics/skills" },
  { name: "pdf", source: "anthropics/skills" },
  { name: "design-taste-frontend", source: "leonxlnx/taste-skill" },
] as const;

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [delayMs, value]);
  return debounced;
}

export function AgentSkillMarketplace({
  existingSkillNames,
  onInstalled,
  query,
  setQuery,
}: {
  existingSkillNames: ReadonlySet<string>;
  onInstalled: (skillName: string) => void;
  query: string;
  setQuery: (query: string) => void;
}) {
  const { t } = useTranslation("ai-ui");
  const providersQuery = useAiSkillRegistryProvidersQuery(true);
  const providers = providersQuery.data?.providers ?? [];
  const provider = providers[0]?.id ?? null;
  const [installingRef, setInstallingRef] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [justInstalled, setJustInstalled] = useState(() => new Set<string>());
  const installMutation = useInstallAiSkillMutation();

  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searchEnabled = debouncedQuery.length >= 2;
  const searchQuery = useAiSkillRegistrySearchQuery(
    provider,
    debouncedQuery,
    searchEnabled
  );
  const results = searchQuery.data?.results ?? [];
  const isDebouncing = query.trim() !== debouncedQuery;
  const searching = searchEnabled;

  const isInstalled = useCallback(
    (name: string) =>
      existingSkillNames.has(name) || justInstalled.has(name),
    [existingSkillNames, justInstalled]
  );

  const handleInstall = useCallback(
    async (result: SkillRegistrySearchResult) => {
      if (!provider) {
        return;
      }
      setLocalError(null);
      setInstallingRef(result.ref.id);
      try {
        const installed = await installMutation.mutateAsync({
          provider,
          ref: { id: result.ref.id },
        });
        setJustInstalled((current) => {
          const next = new Set(current);
          next.add(installed.skill.name);
          return next;
        });
        onInstalled(installed.skill.name);
      } catch (error) {
        setLocalError(
          error instanceof Error
            ? error.message
            : t("skillsInstallModal.installFailed", {
                defaultValue: "Could not install the skill.",
              })
        );
      } finally {
        setInstallingRef(null);
      }
    },
    [installMutation, onInstalled, provider, t]
  );

  if (!searching) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          {t("agentDesk.manage.marketplaceIntro", {
            defaultValue:
              "Search skills.sh for a skill. Install it into this workspace, then save to bind it to the agent.",
          })}
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">
            {t("agentDesk.manage.marketplaceFeatured", {
              defaultValue: "Featured",
            })}
          </h3>
          <div className="flex flex-col gap-2">
            {FEATURED_SKILLS.map((item) => (
              <button
                className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-3 text-left hover:bg-accent/40"
                key={item.name}
                onClick={() => setQuery(item.name)}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {item.name}
                  </span>
                  <span className="line-clamp-2 text-muted-foreground text-xs">
                    {item.source}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!provider && !providersQuery.isLoading) {
    return (
      <p className="px-2 py-6 text-center text-muted-foreground text-sm">
        {t("skillsInstallModal.noProviders", {
          defaultValue: "No skill registries are configured.",
        })}
      </p>
    );
  }

  if (searchQuery.isLoading || isDebouncing || providersQuery.isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 px-2 py-6 text-muted-foreground text-sm">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {t("skillsInstallModal.searching", { defaultValue: "Searching…" })}
      </p>
    );
  }

  if (searchQuery.isError) {
    return (
      <p className="px-2 py-6 text-center text-destructive text-sm" role="alert">
        {t("skillsInstallModal.searchFailed", {
          defaultValue: "Search failed. Please try again.",
        })}
      </p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-muted-foreground text-sm">
        {t("skillsInstallModal.noResults", {
          defaultValue: 'No skills found for "{{query}}".',
          query: debouncedQuery,
        })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {results.map((result) => {
        const installed = isInstalled(result.name);
        const installing = installingRef === result.ref.id;
        return (
          <div
            className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-3"
            key={result.ref.id}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">
                {result.title?.trim() || result.name}
              </p>
              {result.description ? (
                <p className="line-clamp-2 text-muted-foreground text-xs">
                  {result.description}
                </p>
              ) : null}
            </div>
            {installed ? (
              <Button
                className="shrink-0 gap-1.5"
                disabled
                size="sm"
                type="button"
                variant="outline"
              >
                <Check aria-hidden className="size-3.5" />
                {t("skillsInstallModal.installed", {
                  defaultValue: "Installed",
                })}
              </Button>
            ) : (
              <Button
                className="shrink-0 gap-1.5"
                disabled={installing || Boolean(installingRef)}
                onClick={() => handleInstall(result)}
                size="sm"
                type="button"
                variant="outline"
              >
                {installing ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <Download aria-hidden className="size-3.5" />
                )}
                {installing
                  ? t("skillsInstallModal.installing", {
                      defaultValue: "Installing…",
                    })
                  : t("skillsInstallModal.install", {
                      defaultValue: "Install",
                    })}
              </Button>
            )}
          </div>
        );
      })}
      {localError ? (
        <p className="text-destructive text-xs" role="alert">
          {localError}
        </p>
      ) : null}
    </div>
  );
}
