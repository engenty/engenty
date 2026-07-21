import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, ListFilterChip } from "@engenty/ui-core";
import { ListFilter } from "lucide-react";
import type { SecretKind } from "../api.js";
import { SECRET_KIND_LABEL_KEYS } from "../lib/secret-kinds.js";
import type { SecretsScopeFilter } from "../lib/secrets-vault-url.js";

const SECRET_KINDS: SecretKind[] = [
  "username_password",
  "api_key",
  "key_list",
  "credit_card",
  "note",
];

export interface SecretsListFilterState {
  kind: SecretKind | "all";
  scope: SecretsScopeFilter | "all";
}

interface SecretsListFilterBarProps {
  activeOwnerLabel: string | null;
  filtersExpanded: boolean;
  hasActiveChipFilters: boolean;
  onChange: (next: SecretsListFilterState) => void;
  onClearAll: () => void;
  onClearOwner: () => void;
  value: SecretsListFilterState;
}

export function SecretsListFilterBar({
  value,
  onChange,
  filtersExpanded,
  hasActiveChipFilters,
  onClearAll,
  activeOwnerLabel,
  onClearOwner,
}: SecretsListFilterBarProps) {
  const { t } = useTranslation("secrets");

  const scopeOptions = [
    { value: "all", label: t("filter.all") },
    { value: "user", label: t("sidebar.personal") },
    { value: "tenant", label: t("sidebar.workspace") },
  ];

  const kindOptions = [
    { value: "all", label: t("filter.allKinds") },
    ...SECRET_KINDS.map((kind) => ({
      value: kind,
      label: t(SECRET_KIND_LABEL_KEYS[kind]),
    })),
  ];

  const selectedScopeLabel = scopeOptions.find(
    (option) => option.value === value.scope
  )?.label;

  const selectedKindLabel = kindOptions.find(
    (option) => option.value === value.kind
  )?.label;

  if (!filtersExpanded) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground",
          hasActiveChipFilters && "text-foreground"
        )}
      >
        <span className="relative inline-flex">
          <ListFilter className="h-4 w-4" />
          {hasActiveChipFilters ? (
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" />
          ) : null}
        </span>
      </span>

      <ListFilterChip
        activeLabel={selectedScopeLabel}
        ariaLabel={t("filter.scope")}
        clearLabel={t("filter.clear")}
        isActive={value.scope !== "all"}
        label={t("filter.scope")}
        onClear={() => onChange({ ...value, scope: "all" })}
        onSelect={(scope) =>
          onChange({
            ...value,
            scope: scope as SecretsListFilterState["scope"],
          })
        }
        options={scopeOptions}
        value={value.scope}
      />

      <ListFilterChip
        activeLabel={selectedKindLabel}
        ariaLabel={t("filter.kind")}
        clearLabel={t("filter.clear")}
        isActive={value.kind !== "all"}
        label={t("filter.kind")}
        onClear={() => onChange({ ...value, kind: "all" })}
        onSelect={(kind) =>
          onChange({
            ...value,
            kind: kind as SecretsListFilterState["kind"],
          })
        }
        options={kindOptions}
        value={value.kind}
      />

      {activeOwnerLabel ? (
        <Button
          className="h-8 gap-1.5 px-2.5 text-sm"
          onClick={onClearOwner}
          size="sm"
          type="button"
          variant="secondary"
        >
          {activeOwnerLabel}
          <span className="text-muted-foreground">×</span>
        </Button>
      ) : null}

      {hasActiveChipFilters ? (
        <Button
          className="h-8 px-2 text-sm"
          onClick={onClearAll}
          size="sm"
          type="button"
          variant="link"
        >
          {t("filter.clear")}
        </Button>
      ) : null}
    </div>
  );
}
