import { useTranslation } from "@engenty/i18n/ui";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@engenty/ui-core";
import { Tag } from "lucide-react";
import { useMemo } from "react";
import { useCommercialDisciplinesQuery } from "../hooks/use-commercial-disciplines-query.js";
import type { CommercialDiscipline } from "../plugins.js";

interface TaskDisciplineComboboxProps {
  onValueChange: (name: string) => void;
  triggerClassName: string;
  value: string;
}

export function TaskDisciplineCombobox({
  value,
  onValueChange,
  triggerClassName,
}: TaskDisciplineComboboxProps) {
  const { t } = useTranslation("projects");
  const disciplinesQuery = useCommercialDisciplinesQuery();
  const catalog = disciplinesQuery.data ?? [];

  const items = useMemo(() => {
    if (value && !catalog.some((item) => item.name === value)) {
      return [{ name: value, short: "" }, ...catalog];
    }
    return catalog;
  }, [catalog, value]);

  const selected = items.find((item) => item.name === value) ?? null;

  if (!disciplinesQuery.pluginEnabled) {
    if (!value) {
      return null;
    }
    return (
      <span className={triggerClassName}>
        <Tag className="h-3 w-3 text-muted-foreground" />
        <span>{value}</span>
      </span>
    );
  }

  return (
    <Combobox
      autoHighlight
      isItemEqualToValue={(left, right) => left.name === right.name}
      items={items}
      itemToStringLabel={(item) =>
        [item.name, item.short].filter((part) => part.trim()).join(" ")
      }
      onValueChange={(next) => {
        onValueChange(next?.name ?? "");
      }}
      value={selected}
    >
      <ComboboxTrigger className={triggerClassName} showIcon={false}>
        <Tag className="h-3 w-3 text-muted-foreground" />
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? selected.name : t("detail.taskForm.discipline")}
        </span>
      </ComboboxTrigger>
      <ComboboxContent align="start" className="min-w-56">
        <ComboboxInput
          className="w-[calc(100%-0.5rem)]"
          placeholder={t("detail.taskForm.disciplinePlaceholder")}
          showClear={Boolean(selected)}
          showTrigger={false}
        />
        <ComboboxEmpty>{t("detail.taskForm.disciplineEmpty")}</ComboboxEmpty>
        <ComboboxList>
          {(item: CommercialDiscipline) => (
            <ComboboxItem key={item.name} value={item}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate">{item.name}</span>
                {item.short.trim() && item.short.trim() !== item.name ? (
                  <span className="truncate text-muted-foreground text-xs">
                    {item.short}
                  </span>
                ) : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
