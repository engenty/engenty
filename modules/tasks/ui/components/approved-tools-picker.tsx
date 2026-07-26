// Searchable multi-select over GET /api/tools/contracts for approval grants.
// Options prefer ops that require approval; already-granted ids stay selectable.
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Badge, MultiSelect, type MultiSelectGroup } from "@engenty/ui-core";
import { TriangleAlert, X } from "lucide-react";
import { useMemo } from "react";

interface ToolContract {
  auth: { requiresApproval: boolean };
  moduleId: string;
  operationId: string;
  summary?: string;
  toolId: string;
}

async function listToolContracts(
  signal?: AbortSignal
): Promise<ToolContract[]> {
  return requestApiJson<ToolContract[]>("/api/tools/contracts", { signal });
}

function UnknownGrantChips({
  ids,
  onRemove,
  removeLabel,
  warningLabel,
}: {
  ids: string[];
  onRemove: (id: string) => void;
  removeLabel: string;
  warningLabel: string;
}) {
  if (ids.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1.5">
      <p className="flex items-center gap-1.5 text-amber-600 text-xs dark:text-amber-500">
        <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
        {warningLabel}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <Badge
            className="gap-1 border-amber-500/40 font-mono"
            key={id}
            variant="outline"
          >
            {id}
            <button
              aria-label={`${removeLabel} ${id}`}
              className="rounded-full p-0.5 hover:bg-muted"
              onClick={() => onRemove(id)}
              type="button"
            >
              <X aria-hidden className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function ApprovedToolsPicker({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (operationIds: string[]) => void;
  value: string[];
}) {
  const { t } = useTranslation("tasks");
  const contractsQuery = useQuery({
    queryFn: ({ signal }) => listToolContracts(signal),
    queryKey: ["tasks", "tool-contracts"],
    staleTime: 60_000,
  });
  const contracts = contractsQuery.data;

  const groups = useMemo<MultiSelectGroup[]>(() => {
    const granted = new Set(value);
    const byModule = new Map<string, ToolContract[]>();
    for (const contract of contracts ?? []) {
      if (
        !(contract.auth.requiresApproval || granted.has(contract.operationId))
      ) {
        continue;
      }
      const list = byModule.get(contract.moduleId) ?? [];
      list.push(contract);
      byModule.set(contract.moduleId, list);
    }
    return [...byModule.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moduleId, entries]) => ({
        heading: moduleId,
        options: entries
          .slice()
          .sort((a, b) => {
            const labelA = a.summary?.trim() || a.operationId;
            const labelB = b.summary?.trim() || b.operationId;
            return (
              labelA.localeCompare(labelB) ||
              a.operationId.localeCompare(b.operationId)
            );
          })
          .map((contract) => ({
            // Label-first: pills show summary; list shows summary bold + key muted.
            label: contract.summary?.trim() || contract.operationId,
            value: contract.operationId,
          })),
      }));
  }, [contracts, value]);

  const knownIds = useMemo(
    () => new Set((contracts ?? []).map((c) => c.operationId)),
    [contracts]
  );
  const unknownIds = contracts ? value.filter((id) => !knownIds.has(id)) : [];
  const knownSelected = contracts
    ? value.filter((id) => knownIds.has(id))
    : value;

  return (
    <div className="grid gap-2">
      <UnknownGrantChips
        ids={unknownIds}
        onRemove={(id) => onChange(value.filter((entry) => entry !== id))}
        removeLabel={t("detail.removeApprovedTool")}
        warningLabel={t("routines.detail.approvedToolsUnknown")}
      />
      <MultiSelect
        align="start"
        className="w-full min-w-0"
        deduplicateOptions
        defaultValue={knownSelected}
        disabled={disabled || contractsQuery.isLoading}
        hideSelectAll
        maxCount={8}
        onValueChange={(selected) => onChange([...selected, ...unknownIds])}
        options={groups}
        placeholder={t("routines.detail.addApprovedTool")}
        popoverClassName="z-50"
        searchable
      />
    </div>
  );
}
