// Assistant memory settings — read-only view of the working-memory profile
// the copilot maintains about the current user (resource-scoped working
// memory), with a reset button. The agent updates the profile itself; there
// is deliberately no edit form here.
import {
  parseWorkingMemoryProfile,
  useResetWorkingMemoryMutation,
  useWorkingMemoryQuery,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Loader2, Trash2 } from "lucide-react";

function labelize(key: string): string {
  return key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function ProfileValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-0.5 pl-4">
        {value.map((entry) => (
          <li key={String(entry)}>{String(entry)}</li>
        ))}
      </ul>
    );
  }
  return <span>{String(value)}</span>;
}

export function CopilotMemorySettingsPage() {
  const { t } = useTranslation("engenty-copilot");
  const memoryQuery = useWorkingMemoryQuery();
  const resetMutation = useResetWorkingMemoryMutation();

  usePageConfig({
    breadcrumbs: [{ label: t("memory.title") }],
    title: t("memory.title"),
    topbarChrome: "contentBlend",
  });

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

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-auto p-page pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t("memory.title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("memory.subtitle")}
          </p>
        </div>
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
      </div>

      {memoryQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">{t("memory.loading")}</p>
      ) : memoryQuery.isError ? (
        <p className="text-destructive text-sm">{t("memory.loadFailed")}</p>
      ) : isEmpty ? (
        <p className="max-w-xl text-muted-foreground text-sm">
          {t("memory.empty")}
        </p>
      ) : (
        <div className="max-w-2xl space-y-3">
          {entries.map(([key, value]) => (
            <div className="rounded-lg border bg-card p-3" key={key}>
              <h4 className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                {t(`memory.fields.${key}`, { defaultValue: labelize(key) })}
              </h4>
              <div className="text-foreground text-sm">
                <ProfileValue value={value} />
              </div>
            </div>
          ))}
          {memoryQuery.data?.updated_at && (
            <p className="text-muted-foreground text-xs tabular-nums">
              {t("memory.updatedAt", {
                time: new Date(memoryQuery.data.updated_at).toLocaleString(),
              })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
