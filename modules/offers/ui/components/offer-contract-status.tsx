import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, CardContent, Textarea } from "@engenty/ui-core";
import { Check, CheckCircle2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDate } from "../lib/offer-format.js";

interface OfferContractStatusProps {
  busy?: boolean;
  fileName: string | null;
  notes: string | null;
  onMarkSigned: () => void;
  onSaveNotes: (value: string) => void;
  onUploadFile: (fileName: string) => void;
  signedAt: string | null;
}

export function OfferContractStatus({
  busy,
  fileName,
  notes,
  onMarkSigned,
  onSaveNotes,
  onUploadFile,
  signedAt,
}: OfferContractStatusProps) {
  const { t } = useTranslation("offers");
  const fileRef = useRef<HTMLInputElement>(null);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");

  useEffect(() => {
    setDraftNotes(notes ?? "");
  }, [notes]);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h2 className="font-semibold text-lg">{t("contractStatus")}</h2>

        <div className="flex flex-wrap gap-2">
          <input
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onUploadFile(file.name);
              }
              event.target.value = "";
            }}
            ref={fileRef}
            type="file"
          />
          <Button
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            variant="outline"
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {t("uploadContract")}
          </Button>
          {signedAt ? (
            <span className="flex items-center gap-2 text-primary text-sm">
              <CheckCircle2 className="h-4 w-4" />
              {t("contractSignedOn", { date: formatDate(signedAt) })}
            </span>
          ) : (
            <Button disabled={busy} onClick={onMarkSigned} variant="outline">
              <Check className="mr-1.5 h-4 w-4" />
              {t("markSigned")}
            </Button>
          )}
        </div>

        {fileName ? (
          <p className="text-muted-foreground text-sm">
            {t("contractFile", { name: fileName })}
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="font-medium text-sm">{t("contractNotes")}</p>
          <Textarea
            className="min-h-24"
            onBlur={() => {
              if (draftNotes !== (notes ?? "")) {
                onSaveNotes(draftNotes);
              }
            }}
            onChange={(event) => setDraftNotes(event.target.value)}
            placeholder={t("contractNotesPlaceholder")}
            value={draftNotes}
          />
        </div>
      </CardContent>
    </Card>
  );
}
