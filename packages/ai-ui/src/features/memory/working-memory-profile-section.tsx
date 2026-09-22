"use client";

// The copilot's profile of its person — the working memory it keeps for
// itself and reads on every turn (`/ai/v1/memory/working`). Shown on the
// copilot's settings pane beside its pads; reset is the only human edit,
// because the profile is the agent's own reading, not a note to correct.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, CardSection } from "@engenty/ui-core";
import { Loader2, Trash2 } from "lucide-react";
import {
  parseWorkingMemoryProfile,
  useResetWorkingMemoryMutation,
  useWorkingMemoryQuery,
} from "./working-memory-api.js";

function labelize(key: string): string {
  return key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

export function WorkingMemoryProfileSection() {
  const { t } = useTranslation("ai-ui");
  const memoryQuery = useWorkingMemoryQuery();
  const reset = useResetWorkingMemoryMutation();
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
    <CardSection
      cardVariant="flush"
      description={t("workingMemory.subtitle")}
      headerVariant="compact"
      title={t("workingMemory.title")}
      titleAction={
        <Button
          className="gap-1.5 text-destructive hover:bg-destructive/10"
          disabled={reset.isPending || isEmpty}
          onClick={() => reset.mutate()}
          size="sm"
          variant="ghost"
        >
          {reset.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          {t("workingMemory.reset")}
        </Button>
      }
    >
      {memoryQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">
          {t("workingMemory.loading")}
        </p>
      ) : isEmpty ? (
        <p className="text-muted-foreground text-sm">
          {t("workingMemory.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(([key, value]) => (
            <div className="ui-card-panel p-3" key={key}>
              <h4 className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                {labelize(key)}
              </h4>
              <div className="text-foreground text-sm">
                {Array.isArray(value) ? value.join(", ") : String(value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </CardSection>
  );
}
