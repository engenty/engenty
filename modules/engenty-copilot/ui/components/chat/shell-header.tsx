import { useTranslation } from "@engenty/i18n/ui";

export function ChatShellHeader() {
  const { t } = useTranslation("engenty-copilot");

  return (
    <div className="flex h-10 min-w-0 flex-1 items-center gap-2">
      <span className="truncate font-medium text-foreground text-sm">
        {t("menu.label")}
      </span>
    </div>
  );
}
