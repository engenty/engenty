/**
 * Article edit — template binding shown as a muted topline above the title.
 * Pen opens the same inherit / none / template picker formerly below the title.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Check, Pencil, WandSparkles } from "lucide-react";
import { useMemo } from "react";
import type { KbArticleTemplate } from "../../src/schema/types.js";

export interface ArticleTemplateToplineProps {
  effectiveTemplate?: KbArticleTemplate | null;
  /** Override inherit menu + display fallback (e.g. category edit). */
  inheritLabel?: string;
  /** Template-based metadata regeneration (edit page). */
  onRegenerateMetadata?: () => void;
  onSelect: (value: string) => void;
  regenerateMetadataDisabled?: boolean;
  regenerateMetadataPending?: boolean;
  showRegenerateMetadata?: boolean;
  templateId: string;
  templateMode: "inherit" | "none" | "template";
  templates: KbArticleTemplate[];
}

function currentTemplateValue(
  templateMode: ArticleTemplateToplineProps["templateMode"],
  templateId: string
): string {
  if (templateMode === "template" && templateId) {
    return templateId;
  }
  if (templateMode === "none") {
    return "__none__";
  }
  return "__inherit__";
}

export function ArticleTemplateTopline({
  effectiveTemplate = null,
  inheritLabel,
  onSelect,
  onRegenerateMetadata,
  regenerateMetadataDisabled = false,
  regenerateMetadataPending = false,
  showRegenerateMetadata = false,
  templateId,
  templateMode,
  templates,
}: ArticleTemplateToplineProps) {
  const { t } = useTranslation("kb");
  const selected = currentTemplateValue(templateMode, templateId);
  const inheritOptionLabel =
    inheritLabel ?? t("templates.inherit", "Inherit from category");

  const label = useMemo(() => {
    if (templateMode === "none") {
      return t("templates.none", "No template");
    }
    const resolved =
      templateMode === "template"
        ? (templates.find((item) => item.id === templateId) ??
          effectiveTemplate)
        : effectiveTemplate;
    return resolved?.name ?? t("templates.none", "No template");
  }, [effectiveTemplate, t, templateId, templateMode, templates]);

  return (
    <>
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate">{label}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("templates.edit_binding", "Edit template")}
              className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              size="sm"
              title={t("templates.edit_binding", "Edit template")}
              type="button"
              variant="ghost"
            >
              <Pencil aria-hidden className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => onSelect("__inherit__")}>
              <Check
                aria-hidden
                className={cn(
                  "h-4 w-4 shrink-0",
                  selected === "__inherit__" ? "opacity-100" : "opacity-0"
                )}
              />
              {inheritOptionLabel}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSelect("__none__")}>
              <Check
                aria-hidden
                className={cn(
                  "h-4 w-4 shrink-0",
                  selected === "__none__" ? "opacity-100" : "opacity-0"
                )}
              />
              {t("templates.none", "No template")}
            </DropdownMenuItem>
            {templates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                onSelect={() => onSelect(template.id)}
              >
                <Check
                  aria-hidden
                  className={cn(
                    "h-4 w-4 shrink-0",
                    selected === template.id ? "opacity-100" : "opacity-0"
                  )}
                />
                {template.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showRegenerateMetadata && onRegenerateMetadata ? (
        <Button
          className="h-7 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          disabled={regenerateMetadataDisabled || regenerateMetadataPending}
          onClick={onRegenerateMetadata}
          size="sm"
          type="button"
          variant="ghost"
        >
          {regenerateMetadataPending ? (
            <AnimatedLoaderIcon aria-hidden play="always" size="xs" />
          ) : (
            <WandSparkles aria-hidden className="h-3.5 w-3.5" />
          )}
          {t("templates.regenerate_metadata", "Regenerate metadata")}
        </Button>
      ) : null}
    </>
  );
}
