import { useTranslation } from "@engenty/i18n/ui";

interface PhaseEndBlockProps {
  isReadOnly?: boolean;
}

export const PhaseEndBlock = ({ isReadOnly }: PhaseEndBlockProps) => {
  const { t } = useTranslation("offers");

  return (
    <div className="flex items-center gap-2 py-2 text-muted-foreground">
      <div className="flex-1 border-muted-foreground/30 border-t border-dashed" />
      <span className="text-xs">{t("offers.phaseEnd")}</span>
      <div className="flex-1 border-muted-foreground/30 border-t border-dashed" />
    </div>
  );
};
