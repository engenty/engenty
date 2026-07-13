import { Pane, PaneTabStrip, PaneTopBar } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Spinner } from "@engenty/ui-core";
import { Maximize2, Minimize2, Shapes, X } from "lucide-react";
import type { CSSProperties } from "react";
import { resolveArtifactRenderer } from "./artifact-renderers.js";
import type { ArtifactSummary } from "./artifacts-api.js";

export interface ArtifactPaneProps {
  activeContent: string | null;
  activeId: string | null;
  artifacts: ArtifactSummary[];
  className?: string;
  isContentLoading: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSetExpanded: (expanded: boolean) => void;
  onSetPaneOpen: (open: boolean) => void;
  paneExpanded: boolean;
  style?: CSSProperties;
}

/**
 * The Artifact Pane: a typed pane whose top bar holds artifact tabs (never
 * mixed with other tab kinds) plus pane controls; the body renders the active
 * artifact via the renderer registry. Presentational — the list, active
 * content, and actions are provided by WorkspaceArtifactPane.
 */
export function ArtifactPane({
  activeContent,
  activeId,
  artifacts,
  className,
  isContentLoading,
  onActivate,
  onClose,
  onSetExpanded,
  onSetPaneOpen,
  paneExpanded,
  style,
}: ArtifactPaneProps) {
  const { t } = useTranslation("ai-ui");
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
                onClick={() => onSetExpanded(!paneExpanded)}
                size="icon-sm"
                variant="ghost"
              >
                <ExpandIcon className="h-4 w-4" />
              </Button>
              <Button
                aria-label={t("artifacts.closePane")}
                onClick={() => onSetPaneOpen(false)}
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
            onActivate={onActivate}
            onClose={onClose}
          />
        </PaneTopBar>
      }
    >
      {active && Renderer ? (
        isContentLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <Renderer artifact={active} content={activeContent} />
        )
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
