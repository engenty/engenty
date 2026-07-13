import { ENGENTY_COPILOT_HOST_KEY, useArtifacts } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, topbarIconButtonClassName } from "@engenty/ui-core";
import { PanelRightOpen } from "lucide-react";

/**
 * Opens the chat route's artifact pane. Render-nothing while the pane is
 * open — closing belongs to the pane's own top bar.
 */
export function ArtifactPaneToggle() {
  const { t } = useTranslation("engenty-copilot");
  const { paneOpen, setPaneOpen } = useArtifacts(ENGENTY_COPILOT_HOST_KEY);
  if (paneOpen) {
    return null;
  }
  return (
    <Button
      aria-label={t("chat.openArtifacts")}
      className={cn(topbarIconButtonClassName)}
      onClick={() => setPaneOpen(true)}
      size="sm"
      variant="outline"
    >
      <PanelRightOpen className="h-4 w-4" />
    </Button>
  );
}
