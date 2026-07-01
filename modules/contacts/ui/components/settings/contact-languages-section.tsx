import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";

interface ContactLanguagesSectionProps {
  defaultLanguage: string;
  languages: string[];
  newLanguage: string;
  newSalutation: string;
  onDefaultLanguageChange: (value: string) => void;
  onLanguagesChange: (value: string[]) => void;
  onNewLanguageChange: (value: string) => void;
  onNewSalutationChange: (value: string) => void;
  onSalutationsChange: (value: string[]) => void;
  salutations: string[];
}

export function ContactLanguagesSection({
  salutations,
  languages,
  defaultLanguage,
  newSalutation,
  newLanguage,
  onSalutationsChange,
  onLanguagesChange,
  onDefaultLanguageChange,
  onNewSalutationChange,
  onNewLanguageChange,
}: ContactLanguagesSectionProps) {
  const { t } = useTranslation("contacts");

  const addSalutation = () => {
    const next = newSalutation.trim();
    if (!next || salutations.includes(next)) {
      return;
    }
    onSalutationsChange([...salutations, next]);
    onNewSalutationChange("");
  };

  const addLanguage = () => {
    const next = newLanguage.trim();
    if (!next || languages.includes(next)) {
      return;
    }
    onLanguagesChange([...languages, next]);
    onNewLanguageChange("");
  };

  return (
    <section className="space-y-2">
      <h2 className="font-medium text-lg">{t("contactLanguages")}</h2>
      <Card>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">{t("salutations")}</Label>
            <div className="flex flex-wrap gap-2">
              {salutations.map((item) => (
                <Badge
                  className="flex items-center gap-2"
                  key={item}
                  variant="secondary"
                >
                  {item}
                  <button
                    className="text-xs"
                    onClick={() =>
                      onSalutationsChange(
                        salutations.filter((entry) => entry !== item)
                      )
                    }
                    type="button"
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex max-w-md gap-2">
              <Input
                onChange={(e) => onNewSalutationChange(e.target.value)}
                placeholder={t("addSalutationPlaceholder")}
                value={newSalutation}
              />
              <Button onClick={addSalutation} variant="outline">
                +
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">{t("contactLanguages")}</Label>
            <div className="flex flex-wrap gap-2">
              {languages.map((item) => (
                <Badge
                  className="flex items-center gap-2"
                  key={item}
                  variant="secondary"
                >
                  {item}
                  <button
                    className="text-xs"
                    onClick={() =>
                      onLanguagesChange(
                        languages.filter((entry) => entry !== item)
                      )
                    }
                    type="button"
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex max-w-md gap-2">
              <Input
                onChange={(e) => onNewLanguageChange(e.target.value)}
                placeholder={t("addLanguagePlaceholder")}
                value={newLanguage}
              />
              <Button onClick={addLanguage} variant="outline">
                +
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Label className="w-32 text-sm">{t("defaultLanguage")}</Label>
            <Select
              onValueChange={onDefaultLanguageChange}
              value={defaultLanguage}
            >
              <SelectTrigger className="w-56">
                <SelectValue>{defaultLanguage}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>
    </section>
  );
}
