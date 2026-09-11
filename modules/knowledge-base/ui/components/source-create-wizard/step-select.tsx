/**
 * Step 3 — narrow the index, for adapters that return a list.
 *
 * The index is previewed before the source exists, so nothing is written if
 * the user backs out: this is the same preview the create dialog ran, given
 * its own step and its own room.
 */

import { useTranslation } from "@engenty/i18n/ui";
import type { KbSourceIndexEntry } from "../../api.js";
import { SourceIndexBrowser } from "../source-index-browser.js";
import { WizardStepHeader } from "./wizard-chrome.js";

export function WizardStepSelect({
  entries,
  error,
  isLoading,
  onSelectionChange,
  selectedKeys,
  total,
}: {
  entries: KbSourceIndexEntry[];
  error: string | null;
  isLoading: boolean;
  onSelectionChange: (keys: string[]) => void;
  selectedKeys: Set<string>;
  total: number;
}) {
  const { t } = useTranslation("kb");
  return (
    <div className="flex flex-col gap-4">
      <WizardStepHeader
        description={t("sources.wizard_select_desc")}
        title={t("sources.wizard_select_title")}
      />
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
          {error}
        </p>
      ) : (
        <SourceIndexBrowser
          entries={entries}
          isLoading={isLoading}
          onSelectionChange={onSelectionChange}
          selectedKeys={selectedKeys}
          total={total}
        />
      )}
    </div>
  );
}
