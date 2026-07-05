import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input } from "@engenty/ui-core";
import { Plus, Trash2 } from "lucide-react";
import type { Discipline } from "../../api.js";

interface DisciplinesSectionProps {
  currency: string;
  disciplines: Discipline[];
  onDisciplinesChange: (disciplines: Discipline[]) => void;
}

export function DisciplinesSection({
  disciplines,
  currency,
  onDisciplinesChange,
}: DisciplinesSectionProps) {
  const { t } = useTranslation("commercial-settings");

  const addDiscipline = () => {
    onDisciplinesChange([...disciplines, { name: "", short: "", rate: 0 }]);
  };

  const removeDiscipline = (index: number) => {
    onDisciplinesChange(disciplines.filter((_, i) => i !== index));
  };

  const updateDiscipline = (
    index: number,
    field: keyof Discipline,
    value: string | number
  ) => {
    const updated = [...disciplines];
    updated[index] = { ...updated[index], [field]: value };
    onDisciplinesChange(updated);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t("sections.disciplines")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.disciplinesDesc")}
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="p-4">
          <div className="max-w-lg space-y-2">
            <div className="flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
              <span className="flex-1">Name</span>
              <span className="w-16">{t("sections.abbreviation")}</span>
              <span className="w-24 text-right">
                {t("sections.hourlyRate")}
              </span>
              <div className="w-7" />
            </div>
            {disciplines.map((discipline, index) => (
              <div className="flex items-center gap-1.5" key={index}>
                <Input
                  className="h-8 flex-1 text-sm"
                  onChange={(e) =>
                    updateDiscipline(index, "name", e.target.value)
                  }
                  value={discipline.name}
                />
                <Input
                  className="h-8 w-16 text-sm"
                  onChange={(e) =>
                    updateDiscipline(index, "short", e.target.value)
                  }
                  value={discipline.short}
                />
                <div className="relative w-24">
                  <span className="absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground text-xs">
                    {currency || "EUR"}
                  </span>
                  <Input
                    className="h-8 w-24 pl-10 text-right text-sm"
                    onChange={(e) =>
                      updateDiscipline(
                        index,
                        "rate",
                        Number.parseFloat(e.target.value)
                      )
                    }
                    type="number"
                    value={discipline.rate}
                  />
                </div>
                <Button
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeDiscipline(index)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              className="h-7 text-xs"
              onClick={addDiscipline}
              size="sm"
              variant="outline"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("sections.addDiscipline")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
