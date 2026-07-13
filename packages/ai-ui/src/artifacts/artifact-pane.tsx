import { Pane, PaneTabStrip, PaneTopBar } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { Maximize2, Minimize2, Shapes, X } from "lucide-react";
import type { CSSProperties } from "react";
import { resolveArtifactRenderer } from "./artifact-renderers";
import { useArtifacts } from "./artifact-store";

export interface ArtifactPaneProps {
  className?: string;
  hostKey: string;
  style?: CSSProperties;
}

/**
 * The Artifact Pane: a typed pane whose top bar holds artifact tabs (never
 * mixed with other tab kinds) plus pane controls; the body renders the
 * active artifact via the renderer registry.
 */
export function ArtifactPane({ className, hostKey, style }: ArtifactPaneProps) {
  const { t } = useTranslation("ai-ui");
  const {
    activate,
    activeId,
    artifacts,
    close,
    paneExpanded,
    setPaneExpanded,
    setPaneOpen,
  } = useArtifacts(hostKey);
  const ExpandIcon = paneExpanded ? Minimize2 : Maximize2;

  const active = artifacts.find((a) => a.id === activeId) ?? null;
  const Renderer = active ? resolveArtifactRenderer(active.type) : null;

  return (
    <Pane
      aria-label={t("artifacts.paneLabel")}
      className={cn("shrink-0", className)}
      style={style}
      topBar={
        <PaneTopBar
          actions={
            <>
              <Button
                aria-label={
                  paneExpanded
                    ? t("artifacts.collapsePane")
                    : t("artifacts.expandPane")
                }
                onClick={() => setPaneExpanded(!paneExpanded)}
                size="icon-sm"
                variant="ghost"
              >
                <ExpandIcon className="h-4 w-4" />
              </Button>
              <Button
                aria-label={t("artifacts.closePane")}
                onClick={() => setPaneOpen(false)}
                size="icon-sm"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          }
        >
          <PaneTabStrip
            activeId={activeId}
            closeLabel={t("artifacts.closeTab")}
            items={artifacts.map((a) => ({ id: a.id, label: a.title }))}
            onActivate={activate}
            onClose={close}
          />
        </PaneTopBar>
      }
    >
      {active && Renderer ? (
        <Renderer artifact={active} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <Shapes className="h-6 w-6 text-muted-foreground/50" />
          <p className="max-w-sm text-muted-foreground text-sm">
            {t("artifacts.empty")}
          </p>
        </div>
      )}
    </Pane>
  );
}
