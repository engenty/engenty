import { useTranslation } from "@engenty/i18n/ui";
import { Card, Input, Label } from "@engenty/ui-core";

interface IdFormatSectionProps {
  idOffset: number;
  idPostfix: string;
  idPrefix: string;
  onIdOffsetChange: (value: number) => void;
  onIdPostfixChange: (value: string) => void;
  onIdPrefixChange: (value: string) => void;
  previewId: string;
}

export function IdFormatSection({
  idPrefix,
  idOffset,
  idPostfix,
  previewId,
  onIdPrefixChange,
  onIdOffsetChange,
  onIdPostfixChange,
}: IdFormatSectionProps) {
  const { t } = useTranslation("contacts");

  return (
    <section>
      <Card>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Label className="w-32 text-sm" htmlFor="contact-id-prefix">
              {t("prefix")}
            </Label>
            <Input
              className="flex-1"
              id="contact-id-prefix"
              onChange={(e) => onIdPrefixChange(e.target.value)}
              value={idPrefix}
            />
          </div>
          <div className="flex items-center gap-4">
            <Label className="w-32 text-sm" htmlFor="contact-id-offset">
              {t("startNumber")}
            </Label>
            <Input
              className="flex-1"
              id="contact-id-offset"
              onChange={(e) => onIdOffsetChange(Number(e.target.value) || 0)}
              type="number"
              value={idOffset}
            />
          </div>
          <div className="flex items-center gap-4">
            <Label className="w-32 text-sm" htmlFor="contact-id-postfix">
              {t("postfixOptional")}
            </Label>
            <Input
              className="flex-1"
              id="contact-id-postfix"
              onChange={(e) => onIdPostfixChange(e.target.value)}
              value={idPostfix}
            />
          </div>
          <div className="flex items-center gap-4">
            <p className="w-32 font-medium text-sm">{t("preview")}</p>
            <p className="text-muted-foreground text-sm">{previewId}</p>
          </div>
        </div>
      </Card>
    </section>
  );
}
