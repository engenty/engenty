import { ENGENTY_COPILOT_HOST_KEY, useArtifacts } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, topbarIconButtonClassName } from "@engenty/ui-core";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

/** Topbar toggle for the chat route's artifact pane. */
export function ArtifactPaneToggle() {
  const { t } = useTranslation("engenty-copilot");
  const { paneOpen, togglePane } = useArtifacts(ENGENTY_COPILOT_HOST_KEY);
  const Icon = paneOpen ? PanelRightClose : PanelRightOpen;
  return (
    <Button
      aria-expanded={paneOpen}
      aria-label={t("chat.toggleArtifacts")}
      className={cn(topbarIconButtonClassName)}
      onClick={togglePane}
      size="sm"
      variant="outline"
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
