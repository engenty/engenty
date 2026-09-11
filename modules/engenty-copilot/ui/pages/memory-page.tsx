// Working-memory profile: the always-in-context snapshot the assistant
// maintains about you. Reset is the only human edit. This is not the retired
// durable-records module — it is Mastra working memory. Below it, the
// assistant's TASKS.md — its own open items on the same row — which a person
// may correct.
import {
  AgentPadSection,
  parseWorkingMemoryProfile,
  useCopilotTasksQuery,
  useResetWorkingMemoryMutation,
  useSaveCopilotTasksMutation,
  useWorkingMemoryQuery,
} from "@engenty/ai-ui/embed";
import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, DetailPageHeader } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Loader2, Trash2 } from "lucide-react";
import { useMemo } from "react";

function labelize(key: string): string {
  return key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

export function CopilotMemoryPage() {
  const { t } = useTranslation("engenty-copilot");
  const { t: tCommon } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(tCommon("navigation.settings"));

  const memoryQuery = useWorkingMemoryQuery();
  const resetMutation = useResetWorkingMemoryMutation();
  const raw = memoryQuery.data?.working_memory ?? null;
  const profile = parseWorkingMemoryProfile(raw);
  const entries = profile
    ? Object.entries(profile).filter(([, value]) =>
        Array.isArray(value)
          ? value.length > 0
          : value != null && String(value).trim() !== ""
      )
    : [];
  const isEmpty = !raw?.trim() || entries.length === 0;

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("memory.title") },
    ],
    [moduleRootCrumb, t]
  );

  const pageActions = useMemo(
    () => (
      <Button
        className="gap-1.5 text-destructive hover:bg-destructive/10"
        disabled={resetMutation.isPending || isEmpty}
        onClick={() => resetMutation.mutate()}
        size="sm"
        variant="outline"
      >
        {resetMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        {t("memory.reset")}
      </Button>
    ),
    [isEmpty, resetMutation, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    secondaryNavHeaderSlot,
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <DetailPageHeader
        description={
          <p className="text-muted-foreground text-sm">
            {t("memory.subtitle")}
          </p>
        }
        title={t("memory.title")}
      />
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          {memoryQuery.isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t("memory.loading")}
            </p>
          ) : isEmpty ? (
            <p className="text-muted-foreground text-sm">{t("memory.empty")}</p>
          ) : (
            entries.map(([key, value]) => (
              <div className="ui-card-panel p-3" key={key}>
                <h4 className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  {labelize(key)}
                </h4>
                <div className="text-foreground text-sm">
                  {Array.isArray(value) ? value.join(", ") : String(value)}
                </div>
              </div>
            ))
          )}
          <CopilotTasksSection />
        </div>
      </div>
    </div>
  );
}

function CopilotTasksSection() {
  const query = useCopilotTasksQuery();
  const save = useSaveCopilotTasksMutation();
  const stored = query.data?.tasks ?? "";
  return (
    <AgentPadSection
      clear={{
        disabled: !stored,
        run: (onSuccess) => save.mutate("", { onSuccess }),
      }}
      editable
      enabled={query.data?.enabled ?? true}
      kind="tasks"
      maxChars={query.data?.max_chars ?? 6000}
      save={save}
      stored={stored}
    />
  );
}
