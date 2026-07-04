import { useTranslation } from "@engenty/i18n/ui";
import { Card, CardContent, Textarea } from "@engenty/ui-core";
import { useEffect, useState } from "react";

interface OfferNotesCardProps {
  onSave: (value: string) => void;
  placeholderKey: string;
  titleKey: string;
  value: string | null;
}

/** Generic notes card (internal notes, contract notes); persists on blur. */
export function OfferNotesCard({
  onSave,
  placeholderKey,
  titleKey,
  value,
}: OfferNotesCardProps) {
  const { t } = useTranslation("offers");
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <h2 className="font-semibold text-lg">{t(titleKey)}</h2>
        <Textarea
          className="min-h-28"
          onBlur={() => {
            if (draft !== (value ?? "")) {
              onSave(draft);
            }
          }}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t(placeholderKey)}
          value={draft}
        />
      </CardContent>
    </Card>
  );
}
