/**
 * Step 5 — what should exist in the knowledge base because of this source?
 *
 * Two decisions, in this order: who authors (we file the source text, or an
 * agent writes a wiki from it), and — when we file it — how many articles come
 * out. Everything else is a checkbox under that choice. Nothing is written
 * yet; the wizard's finish action persists this as the source's standing
 * ingest configuration.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@engenty/ui-core";
import { BookOpen, Bot, Files, FileText } from "lucide-react";
import { useMemo } from "react";
import {
  type KbArticleTemplate,
  kbTemplateHasContentStructure,
} from "../../../src/schema/types.js";
import { buildCategoryDisplayPaths } from "../../lib/category-display-paths.js";
import type { KbSourceWizardPlan } from "../../lib/source-create-wizard.js";
import {
  categoriesQueryOptions,
  kbTemplatesQueryOptions,
} from "../../queries.js";
import { SourceAnalyzeProposal } from "../source-analyze-proposal.js";
import { SourceIngestOptions } from "../source-ingest-options.js";
import { SourceTemplateSuggestion } from "../source-template-suggestion.js";
import { WizardStepHeader } from "./wizard-chrome.js";

export function WizardStepPlan({
  analyzable,
  kbId,
  onChange,
  primarySourceId,
  value,
}: {
  /** False when the test fetch returned nothing for the analyzer to read. */
  analyzable: boolean;
  kbId: string;
  onChange: (next: KbSourceWizardPlan) => void;
  primarySourceId: string;
  value: KbSourceWizardPlan;
}) {
  const { t } = useTranslation("kb");
  const set = (patch: Partial<KbSourceWizardPlan>) =>
    onChange({ ...value, ...patch });

  const { data: categories = [] } = useQuery(categoriesQueryOptions(kbId));
  const decoratedCategories = useMemo(
    () => buildCategoryDisplayPaths(categories),
    [categories]
  );
  const { data: templates = [] } = useQuery(kbTemplatesQueryOptions(kbId));
  const defaultCategoryId =
    categories.find((category) => category.is_default)?.id ?? "";

  // What `inherit` actually resolves to, walking up the category chain — the
  // picker has to name it, or "Inherit" is a promise the user cannot check.
  const inheritedTemplate = useMemo((): KbArticleTemplate | null => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    let current =
      (value.categoryId
        ? byId.get(value.categoryId)
        : categories.find((category) => category.is_default)) ?? null;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current.id)) {
        return null;
      }
      seen.add(current.id);
      if (current.template_mode === "none") {
        return null;
      }
      if (current.template_mode === "template" && current.template_id) {
        return templates.find((tpl) => tpl.id === current?.template_id) ?? null;
      }
      current = current.parent_id
        ? (byId.get(current.parent_id) ?? null)
        : null;
    }
    return null;
  }, [categories, templates, value.categoryId]);

  const selectedTemplate =
    value.templateMode === "template"
      ? (templates.find((tpl) => tpl.id === value.templateId) ?? null)
      : value.templateMode === "inherit"
        ? inheritedTemplate
        : null;
  const categorySelectValue =
    value.categoryId && value.categoryId !== defaultCategoryId
      ? value.categoryId
      : "__default__";

  return (
    <div className="flex flex-col gap-5">
      <WizardStepHeader
        description={t("sources.wizard_plan_desc")}
        title={t("sources.wizard_plan_title")}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PlanCard
          active={!value.agentic}
          description={t("sources.ingest_strategy_authored_desc")}
          icon={<BookOpen className="h-6 w-6" />}
          label={t("sources.ingest_strategy_authored_label")}
          onClick={() => set({ agentic: false })}
        />
        <PlanCard
          active={value.agentic}
          description={t("sources.ingest_strategy_agentic_desc")}
          icon={<Bot className="h-6 w-6" />}
          label={t("sources.ingest_strategy_agentic_label")}
          onClick={() => set({ agentic: true })}
        />
      </div>

      <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
        {value.agentic ? (
          <>
            <SourceAnalyzeProposal
              disabled={!analyzable}
              onApply={(instructions) => set({ instructions })}
              sourceId={primarySourceId}
            />
            {analyzable ? null : (
              <p className="text-muted-foreground text-xs">
                {t("sources.wizard_plan_analyze_unavailable")}
              </p>
            )}
            <div className="space-y-1">
              <label
                className="font-medium text-sm"
                htmlFor="kb-wizard-instructions"
              >
                {t("sources.ingest_agentic_instructions_label")}
              </label>
              <p className="text-muted-foreground text-xs">
                {t("sources.ingest_agentic_instructions_desc")}
              </p>
              <Textarea
                className="min-h-[160px] resize-y text-sm"
                id="kb-wizard-instructions"
                onChange={(event) => set({ instructions: event.target.value })}
                placeholder={t(
                  "sources.ingest_agentic_instructions_placeholder"
                )}
                value={value.instructions}
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <p className="font-medium text-sm">
                {t("sources.ingest_scope_title")}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ScopeCard
                  active={value.scope === "per_entry"}
                  description={t("sources.ingest_scope_per_entry_desc")}
                  icon={<Files className="h-4 w-4" />}
                  label={t("sources.ingest_scope_per_entry_label")}
                  onClick={() => set({ scope: "per_entry" })}
                />
                <ScopeCard
                  active={value.scope === "per_source"}
                  description={t("sources.ingest_scope_per_source_desc")}
                  icon={<FileText className="h-4 w-4" />}
                  label={t("sources.ingest_scope_per_source_label")}
                  onClick={() => set({ scope: "per_source" })}
                />
              </div>
            </div>
            <SourceIngestOptions
              onChange={(content) => set({ content })}
              perSource={value.scope === "per_source"}
              templateHasStructure={kbTemplateHasContentStructure(
                selectedTemplate
              )}
              value={value.content}
            />
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className="font-medium text-sm" htmlFor="kb-wizard-category">
            {t("sources.ingest_category_label")}
          </label>
          <p className="text-muted-foreground text-xs">
            {t("sources.ingest_category_desc")}
          </p>
          <Select
            onValueChange={(next) =>
              set({ categoryId: next === "__default__" ? "" : next })
            }
            value={categorySelectValue}
          >
            <SelectTrigger className="h-8 text-sm" id="kb-wizard-category">
              <SelectValue>
                {categorySelectValue === "__default__"
                  ? t("sources.ingest_category_default")
                  : (decoratedCategories.find(
                      (category) => category.id === categorySelectValue
                    )?.display_path ?? t("sources.ingest_category_selected"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                {t("sources.ingest_category_default")}
              </SelectItem>
              {decoratedCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.display_path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Only the authored path files entries against a template; the agent
            writes its own pages. */}
        {value.agentic ? null : (
          <div className="flex flex-col gap-2">
            <label className="font-medium text-sm" htmlFor="kb-wizard-template">
              {t("templates.article_template", "Template")}
            </label>
            <p className="text-muted-foreground text-xs">
              {t("templates.ingest_template_desc")}
            </p>
            <Select
              onValueChange={(next) => {
                if (next === "__inherit__") {
                  set({ templateId: "", templateMode: "inherit" });
                  return;
                }
                if (next === "__none__") {
                  set({ templateId: "", templateMode: "none" });
                  return;
                }
                set({ templateId: next, templateMode: "template" });
              }}
              value={
                value.templateMode === "template" && value.templateId
                  ? value.templateId
                  : value.templateMode === "none"
                    ? "__none__"
                    : "__inherit__"
              }
            >
              <SelectTrigger className="h-8 text-sm" id="kb-wizard-template">
                <SelectValue>
                  {value.templateMode === "none"
                    ? t("templates.none", "No template")
                    : value.templateMode === "template" && value.templateId
                      ? (templates.find((tpl) => tpl.id === value.templateId)
                          ?.name ?? value.templateId)
                      : inheritedTemplate
                        ? t("templates.inherit_named", {
                            defaultValue: `Inherit (${inheritedTemplate.name})`,
                            name: inheritedTemplate.name,
                          })
                        : t("templates.inherit", "Inherit from category")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">
                  {inheritedTemplate
                    ? t("templates.inherit_named", {
                        defaultValue: `Inherit (${inheritedTemplate.name})`,
                        name: inheritedTemplate.name,
                      })
                    : t("templates.inherit", "Inherit from category")}
                </SelectItem>
                <SelectItem value="__none__">
                  {t("templates.none", "No template")}
                </SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SourceTemplateSuggestion
              disabled={!analyzable}
              kbId={kbId}
              onCreated={(templateId) =>
                set({ templateId, templateMode: "template" })
              }
              sourceId={primarySourceId}
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2">
          <div className="min-w-0">
            <label
              className="font-medium text-sm"
              htmlFor="kb-wizard-plan-active"
            >
              {t("sources.ingest_active_label")}
            </label>
            <p className="text-muted-foreground text-xs leading-snug">
              {value.agentic
                ? t("sources.ingest_active_agentic_desc")
                : t("sources.ingest_active_authored_desc")}
            </p>
          </div>
          <Switch
            checked={value.active}
            id="kb-wizard-plan-active"
            onCheckedChange={(next) => set({ active: next === true })}
          />
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  active,
  description,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:border-muted-foreground/40"
      )}
      onClick={onClick}
      type="button"
    >
      <span className={cn("text-muted-foreground", active && "text-primary")}>
        {icon}
      </span>
      <span className="font-medium text-sm leading-tight">{label}</span>
      <span className="text-muted-foreground text-xs leading-snug">
        {description}
      </span>
    </button>
  );
}

function ScopeCard({
  active,
  description,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:bg-muted/40"
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn("mt-0.5 text-muted-foreground", active && "text-primary")}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-sm leading-snug">{label}</span>
        <span className="block text-muted-foreground text-xs leading-snug">
          {description}
        </span>
      </span>
    </button>
  );
}
