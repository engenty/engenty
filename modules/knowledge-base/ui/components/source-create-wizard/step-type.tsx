/**
 * Step 1 — what kind of source is this?
 *
 * The old entry point was a dropdown of adapter ids, which asks the user to
 * know the answer before the question is explained. Here every adapter is a
 * tile with a plain-language line about what it is good for, grouped by where
 * the material lives.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import {
  Database,
  FileUp,
  Globe,
  Link2,
  Network,
  PenLine,
  Zap,
} from "lucide-react";
import type { KbSourceAdapterDescriptor } from "../../api.js";
import { groupKbSourceWizardAdapters } from "../../lib/source-create-wizard.js";
import { WizardStepHeader } from "./wizard-chrome.js";

const ADAPTER_ICONS: Record<string, typeof Link2> = {
  file_upload: FileUp,
  firecrawl_url: Zap,
  manual: PenLine,
  sitemap: Network,
  url: Link2,
  web_index: Globe,
};

export function WizardStepType({
  adapters,
  onSelect,
  selectedAdapterId,
}: {
  adapters: KbSourceAdapterDescriptor[];
  onSelect: (adapterId: string) => void;
  selectedAdapterId: string | null;
}) {
  const { t } = useTranslation("kb");
  const groups = groupKbSourceWizardAdapters(adapters);

  return (
    <div className="flex flex-col gap-5">
      <WizardStepHeader
        description={t("sources.wizard_type_desc")}
        title={t("sources.wizard_type_title")}
      />
      {groups.map(({ adapters: rows, group }) => (
        <div className="space-y-2" key={group}>
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t(`sources.wizard_group_${group}`)}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((adapter) => {
              const Icon = ADAPTER_ICONS[adapter.id] ?? Database;
              const active = adapter.id === selectedAdapterId;
              // Falls back to the registry label when this adapter has no
              // wizard copy of its own, so a new adapter is still pickable.
              const hint = t(`sources.wizard_kind_${adapter.id}_desc`, {
                defaultValue: "",
              });
              return (
                <button
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-muted-foreground/40"
                  )}
                  key={adapter.id}
                  onClick={() => onSelect(adapter.id)}
                  type="button"
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "mt-0.5 h-5 w-5 shrink-0 text-muted-foreground",
                      active && "text-primary"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-sm leading-snug">
                      {t(`sources.wizard_kind_${adapter.id}_label`, {
                        defaultValue: adapter.label,
                      })}
                    </span>
                    {hint ? (
                      <span className="block text-muted-foreground text-xs leading-snug">
                        {hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
