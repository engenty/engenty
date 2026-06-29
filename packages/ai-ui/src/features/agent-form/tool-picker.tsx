// Searchable multi-select over GET /ai/registry/tools, grouped by source.
// Empty selection means the agent default tool profile applies (not "no tools").

import { useTranslation } from "@engenty/i18n/ui";
import { MultiSelect, type MultiSelectGroup } from "@engenty/ui-core";
import { useMemo } from "react";
import { useAiToolsQuery } from "../../lib/admin/ai-runtime-queries";
import { UnknownReferenceChips } from "./unknown-reference-chips";

interface RegistryToolEntry {
  description?: string;
  id: string;
  name: string;
  /** Stamped by apps/ai for module/MCP tools; registry rows default to custom. */
  source?: string;
}

export function ToolPicker({
  onChange,
  value,
}: {
  onChange: (toolIds: string[]) => void;
  value: string[];
}) {
  const { t } = useTranslation("ai-ui");
  const toolsQuery = useAiToolsQuery();
  const tools = toolsQuery.data?.tools as RegistryToolEntry[] | undefined;

  const groups = useMemo<MultiSelectGroup[]>(() => {
    const bySource = new Map<string, RegistryToolEntry[]>();
    for (const tool of tools ?? []) {
      const source = tool.source ?? "custom";
      bySource.set(source, [...(bySource.get(source) ?? []), tool]);
    }
    return [...bySource.entries()].map(([source, entries]) => ({
      heading: source === "custom" ? t("agentForm.tools.groupCustom") : source,
      options: entries.map((tool) => ({
        label: tool.name === tool.id ? tool.id : `${tool.name} (${tool.id})`,
        value: tool.id,
      })),
    }));
  }, [t, tools]);

  const knownIds = useMemo(
    () => new Set((tools ?? []).map((tool) => tool.id)),
    [tools]
  );
  const unknownIds = tools ? value.filter((id) => !knownIds.has(id)) : [];
  const knownSelected = tools ? value.filter((id) => knownIds.has(id)) : value;

  return (
    <div className="grid gap-2">
      <UnknownReferenceChips
        ids={unknownIds}
        label={t("agentForm.tools.unknownWarning")}
        onRemove={(id) => onChange(value.filter((entry) => entry !== id))}
        removeLabel={t("agentForm.tools.removeUnknown")}
      />
      <MultiSelect
        defaultValue={knownSelected}
        disabled={toolsQuery.isLoading}
        onValueChange={(selected) => onChange([...selected, ...unknownIds])}
        options={groups}
        placeholder={t("agentForm.tools.placeholder")}
        searchable
      />
      <p className="text-muted-foreground text-xs">
        {t("agentForm.tools.hint")}
      </p>
    </div>
  );
}
