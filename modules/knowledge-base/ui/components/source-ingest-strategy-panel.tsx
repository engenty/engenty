import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery } from "@engenty/query-client";
import {
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { BookOpen, Bot, Files, FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { KbSourceIngestConfig } from "../../src/schema/sources.js";
import {
  type KbArticleTemplate,
  type KbSourceItem,
  type KbTemplateBindingMode,
  kbTemplateHasContentStructure,
} from "../../src/schema/types.js";
import {
  type IngestKbSourceOptions,
  ingestKbSource,
  type KbSourceIngestStrategy,
} from "../api.js";
import { kbArticlePath } from "../kb-paths.js";
import { buildCategoryDisplayPaths } from "../lib/category-display-paths.js";
import { buildAgenticIngestInstructionBlock } from "../lib/source-agentic-ingest-options.js";
import {
  articlesQueryOptions,
  categoriesQueryOptions,
  kbSourceItemsQueryOptions,
  kbTemplatesQueryOptions,
  useKbSourceMutations,
} from "../queries.js";
import {
  IngestActiveSwitch,
  SourceAgenticIngestPanel,
} from "./source-agentic-ingest-panel.js";
import {
  type KbIngestContentOptions,
  SourceIngestOptions,
} from "./source-ingest-options.js";
import { SourceTemplateSuggestion } from "./source-template-suggestion.js";

function countIngestReadyItems(items: KbSourceItem[]) {
  const active = items.filter((item) => item.status === "active");
  const fetched = active.filter(
    (item) =>
      item.content_hash ||
      (typeof item.metadata.section_count === "number" &&
        item.metadata.section_count > 0)
  );
  return { active: active.length, fetched: fetched.length };
}

interface Props {
  ingestConfig?: KbSourceIngestConfig;
  kbId: string;
  sourceId: string;
  syncRunning?: boolean;
}

export function SourceIngestStrategyPanel({
  ingestConfig,
  kbId,
  sourceId,
  syncRunning = false,
}: Props) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const { update: updateSourceMut } = useKbSourceMutations();

  // Two separate decisions: WHO authors (we do, or an agent), and — when we
  // do — how many articles come out. Collapsing them into one card row is what
  // made "Artikel erstellen" and "Zusammenfassung" look like rival strategies
  // when they only ever differed in grouping.
  const [agentic, setAgentic] = useState(false);
  const [scope, setScope] = useState<"per_entry" | "per_source">("per_entry");
  const strategy: KbSourceIngestStrategy = agentic ? "agentic" : scope;
  const [parentArticleId, setParentArticleId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [templateMode, setTemplateMode] =
    useState<KbTemplateBindingMode>("inherit");
  const [templateId, setTemplateId] = useState<string>("");
  const [templateTouched, setTemplateTouched] = useState(false);
  const [content, setContent] = useState<KbIngestContentOptions>({
    attachOriginal: false,
    includeFullContent: true,
    includeQuestions: false,
    includeSummary: false,
    splitLongArticles: false,
  });
  const [instructions, setInstructions] = useState("");
  const [agenticActive, setAgenticActive] = useState(false);
  const [authoredActive, setAuthoredActive] = useState(false);

  useEffect(() => {
    setAgenticActive(ingestConfig?.agentic_active ?? false);
    setAuthoredActive(ingestConfig?.authored_active ?? false);
  }, [ingestConfig?.agentic_active, ingestConfig?.authored_active]);

  useEffect(() => {
    setCategoryId(ingestConfig?.category_id ?? "");
  }, [ingestConfig?.category_id]);

  useEffect(() => {
    setInstructions(ingestConfig?.agentic_instructions ?? "");
  }, [ingestConfig?.agentic_instructions]);

  useEffect(() => {
    if (!ingestConfig) {
      return;
    }
    const includeSummary = ingestConfig.include_summary ?? false;
    setContent({
      attachOriginal: ingestConfig.attach_original ?? false,
      includeFullContent: ingestConfig.include_full_content ?? !includeSummary,
      includeQuestions: ingestConfig.include_questions ?? false,
      includeSummary,
      splitLongArticles: ingestConfig.split_long_articles ?? false,
    });
  }, [ingestConfig]);

  useEffect(() => {
    setParentArticleId(ingestConfig?.parent_article_id ?? "");
  }, [ingestConfig?.parent_article_id]);

  const { data: articlesData } = useQuery(
    articlesQueryOptions({
      kb_id: kbId,
      page: 1,
      page_size: 100,
      sort_by: "title",
      sort_order: "asc",
    })
  );
  const articles = articlesData?.data ?? [];

  const { data: categories = [] } = useQuery(categoriesQueryOptions(kbId));
  const { data: templates = [] } = useQuery(kbTemplatesQueryOptions(kbId));
  const decoratedCategories = useMemo(
    () => buildCategoryDisplayPaths(categories),
    [categories]
  );
  const defaultCategoryId =
    categories.find((category) => category.is_default)?.id ?? "";
  const categorySelectValue =
    categoryId && categoryId !== defaultCategoryId ? categoryId : "__default__";
  const selectedCategory =
    categoryId && decoratedCategories.length > 0
      ? (decoratedCategories.find((category) => category.id === categoryId) ??
        null)
      : null;
  const showUnknownSelectedCategory = Boolean(
    categorySelectValue !== "__default__" && !selectedCategory
  );

  const inheritedTemplate = useMemo((): KbArticleTemplate | null => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    let current =
      (categoryId
        ? byId.get(categoryId)
        : categories.find((c) => c.is_default)) ?? null;
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
        return (
          templates.find((template) => template.id === current?.template_id) ??
          null
        );
      }
      current = current.parent_id
        ? (byId.get(current.parent_id) ?? null)
        : null;
    }
    return null;
  }, [categories, categoryId, templates]);

  const selectedTemplate =
    templateMode === "template"
      ? (templates.find((template) => template.id === templateId) ?? null)
      : templateMode === "inherit"
        ? inheritedTemplate
        : null;
  const selectedTemplateHasStructure =
    kbTemplateHasContentStructure(selectedTemplate);

  useEffect(() => {
    if (templateTouched) {
      return;
    }
    setTemplateMode("inherit");
    setTemplateId("");
  }, [categoryId, templateTouched]);

  const { data: sourceItemsPage } = useQuery(
    kbSourceItemsQueryOptions({
      page: 1,
      page_size: 200,
      sourceId,
    })
  );
  const ingestReadiness = useMemo(
    () => countIngestReadyItems(sourceItemsPage?.data ?? []),
    [sourceItemsPage?.data]
  );
  const ingestBlocked =
    syncRunning ||
    (ingestReadiness.active > 0 && ingestReadiness.fetched === 0);

  const persistCategory = useCallback(
    (nextCategoryId: string) => {
      updateSourceMut.mutate(
        {
          id: sourceId,
          input: {
            ingest_config: {
              category_id: nextCategoryId || null,
            },
          },
        },
        {
          onError: (err) => {
            toast.error(
              err instanceof Error ? err.message : t("sources.save_failed")
            );
          },
        }
      );
    },
    [sourceId, t, updateSourceMut]
  );

  const persistActive = useCallback(
    (patch: { agentic_active?: boolean; authored_active?: boolean }) => {
      updateSourceMut.mutate(
        { id: sourceId, input: { ingest_config: patch } },
        {
          onError: (err) => {
            toast.error(
              err instanceof Error ? err.message : t("sources.save_failed")
            );
          },
        }
      );
    },
    [sourceId, t, updateSourceMut]
  );

  const ingestMutation = useMutation({
    mutationFn: (opts: IngestKbSourceOptions) => ingestKbSource(sourceId, opts),
    onSuccess: (result) => {
      if (result.async_run && result.task_id) {
        toast.success(t("sources.ingest_agentic_queued"), {
          action: {
            label: t("sources.ingest_view_task"),
            onClick: () => navigate(`/mdl/tasks/${result.task_id}`),
          },
        });
        navigate(`/mdl/tasks/${result.task_id}`);
      } else if (result.task_id) {
        toast.success(
          t("sources.ingest_success", { count: result.ingested_items }),
          {
            action: {
              label: t("sources.ingest_view_task"),
              onClick: () => navigate(`/mdl/tasks/${result.task_id}`),
            },
          }
        );
      } else {
        toast.success(
          t("sources.ingest_success", { count: result.ingested_items })
        );
        if (result.article_ids.length > 0) {
          navigate(kbArticlePath(result.article_ids[0]!));
        }
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("sources.ingest_failed")
      );
    },
  });

  const handleConfirm = useCallback(() => {
    const agenticInstructionBlock =
      strategy === "agentic"
        ? buildAgenticIngestInstructionBlock({ instructions })
        : instructions.trim() || undefined;
    ingestMutation.mutate({
      attach_original: content.attachOriginal,
      category_id: categoryId || null,
      include_full_content: content.includeFullContent,
      include_questions: content.includeQuestions,
      include_summary: content.includeSummary,
      instructions: agenticInstructionBlock,
      parent_article_id: parentArticleId || undefined,
      split_long_articles: content.splitLongArticles,
      strategy,
      template_id: templateMode === "template" ? templateId || null : null,
      template_mode: templateMode,
    });
  }, [
    categoryId,
    content,
    ingestMutation,
    instructions,
    parentArticleId,
    strategy,
    templateId,
    templateMode,
  ]);

  return (
    <div className="flex flex-col gap-5">
      {syncRunning ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-900 text-sm dark:text-amber-100">
          {t("sources.ingest_sync_running")}
        </p>
      ) : null}
      {!syncRunning &&
      ingestReadiness.active > 0 &&
      ingestReadiness.fetched === 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-900 text-sm dark:text-amber-100">
          {t("sources.ingest_no_fetched_items", {
            count: ingestReadiness.active,
          })}
        </p>
      ) : null}
      {!syncRunning &&
      ingestReadiness.active > 0 &&
      ingestReadiness.fetched > 0 &&
      ingestReadiness.fetched < ingestReadiness.active ? (
        <p className="text-muted-foreground text-sm">
          {t("sources.ingest_partial_ready", {
            fetched: ingestReadiness.fetched,
            total: ingestReadiness.active,
          })}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StrategyCard
          active={!agentic}
          description={t("sources.ingest_strategy_authored_desc")}
          disabled={ingestMutation.isPending}
          icon={<BookOpen className="h-6 w-6" />}
          label={t("sources.ingest_strategy_authored_label")}
          onClick={() => setAgentic(false)}
        />
        <StrategyCard
          active={agentic}
          description={t("sources.ingest_strategy_agentic_desc")}
          disabled={ingestMutation.isPending}
          icon={<Bot className="h-6 w-6" />}
          label={t("sources.ingest_strategy_agentic_label")}
          onClick={() => setAgentic(true)}
        />
      </div>

      {/* Strategy-specific options */}
      {strategy === "agentic" ? (
        <SourceAgenticIngestPanel
          active={agenticActive}
          articles={articles}
          categoryId={categoryId}
          decoratedCategories={decoratedCategories}
          instructions={instructions}
          onActiveChange={(next) => {
            setAgenticActive(next);
            persistActive({ agentic_active: next });
          }}
          onCategoryChange={setCategoryId}
          onSave={() => {
            const savedCategoryId =
              categoryId && categoryId !== defaultCategoryId
                ? categoryId
                : null;
            updateSourceMut.mutate(
              {
                id: sourceId,
                input: {
                  ingest_config: {
                    agentic_instructions: instructions.trim(),
                    category_id: savedCategoryId,
                    parent_article_id: parentArticleId || null,
                  },
                },
              },
              {
                onError: (err) => {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : t("sources.save_failed")
                  );
                },
                onSuccess: () => toast.success(t("sources.updated")),
              }
            );
          }}
          parentArticleId={parentArticleId}
          savePending={updateSourceMut.isPending}
          setInstructions={setInstructions}
          setParentArticleId={setParentArticleId}
          sourceId={sourceId}
          updatePending={updateSourceMut.isPending}
        />
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
          <IngestActiveSwitch
            active={authoredActive}
            description={t("sources.ingest_active_authored_desc")}
            id="ingest-authored-active"
            onChange={(next) => {
              setAuthoredActive(next);
              persistActive({ authored_active: next });
            }}
          />

          <div className="space-y-2">
            <p className="font-medium text-sm">
              {t("sources.ingest_scope_title")}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ScopeCard
                active={scope === "per_entry"}
                description={t("sources.ingest_scope_per_entry_desc")}
                disabled={ingestMutation.isPending}
                icon={<Files className="h-4 w-4" />}
                label={t("sources.ingest_scope_per_entry_label")}
                onClick={() => setScope("per_entry")}
              />
              <ScopeCard
                active={scope === "per_source"}
                description={t("sources.ingest_scope_per_source_desc")}
                disabled={ingestMutation.isPending}
                icon={<FileText className="h-4 w-4" />}
                label={t("sources.ingest_scope_per_source_label")}
                onClick={() => setScope("per_source")}
              />
            </div>
          </div>

          <SourceIngestOptions
            onChange={setContent}
            perSource={scope === "per_source"}
            templateHasStructure={selectedTemplateHasStructure}
            value={content}
          />

          <div className="flex flex-col gap-1">
            <label className="font-medium text-sm" htmlFor="ingest-category">
              {t("sources.ingest_category_label")}
            </label>
            <p className="text-muted-foreground text-xs">
              {t("sources.ingest_category_desc")}
            </p>
            <Select
              disabled={updateSourceMut.isPending}
              onValueChange={(v) => {
                const next = v === "__default__" ? "" : v;
                setCategoryId(next);
                persistCategory(next);
              }}
              value={categorySelectValue}
            >
              <SelectTrigger className="h-8 text-sm" id="ingest-category">
                <SelectValue
                  placeholder={t("sources.ingest_category_placeholder")}
                >
                  {categorySelectValue === "__default__"
                    ? t("sources.ingest_category_default")
                    : (decoratedCategories.find(
                        (c) => c.id === categorySelectValue
                      )?.display_path ?? t("sources.ingest_category_selected"))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  {t("sources.ingest_category_default")}
                </SelectItem>
                {showUnknownSelectedCategory ? (
                  <SelectItem value={categoryId}>
                    {t("sources.ingest_category_selected")}
                  </SelectItem>
                ) : null}
                {decoratedCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.display_path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-medium text-sm" htmlFor="ingest-template">
              {t("templates.article_template", "Template")}
            </label>
            <p className="text-muted-foreground text-xs">
              {t(
                "templates.ingest_template_desc",
                "Prefilled from the selected category. Override for this ingest run if needed."
              )}
            </p>
            <Select
              onValueChange={(value) => {
                setTemplateTouched(true);
                if (value === "__inherit__") {
                  setTemplateMode("inherit");
                  setTemplateId("");
                  return;
                }
                if (value === "__none__") {
                  setTemplateMode("none");
                  setTemplateId("");
                  return;
                }
                setTemplateMode("template");
                setTemplateId(value);
              }}
              value={
                templateMode === "template" && templateId
                  ? templateId
                  : templateMode === "none"
                    ? "__none__"
                    : "__inherit__"
              }
            >
              <SelectTrigger className="h-8 text-sm" id="ingest-template">
                <SelectValue>
                  {templateMode === "none"
                    ? t("templates.none", "No template")
                    : templateMode === "template" && templateId
                      ? (templates.find((tpl) => tpl.id === templateId)?.name ??
                        templateId)
                      : inheritedTemplate
                        ? t("templates.inherit_named", {
                            name: inheritedTemplate.name,
                            defaultValue: `Inherit (${inheritedTemplate.name})`,
                          })
                        : t("templates.inherit", "Inherit from category")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">
                  {inheritedTemplate
                    ? t("templates.inherit_named", {
                        name: inheritedTemplate.name,
                        defaultValue: `Inherit (${inheritedTemplate.name})`,
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
          </div>

          <SourceTemplateSuggestion
            disabled={ingestBlocked}
            kbId={kbId}
            onCreated={(nextTemplateId) => {
              setTemplateTouched(true);
              setTemplateMode("template");
              setTemplateId(nextTemplateId);
            }}
            sourceId={sourceId}
          />

          <div className="flex flex-col gap-1">
            <label
              className="font-medium text-sm"
              htmlFor="ingest-parent-article"
            >
              {t("sources.ingest_parent_article_label")}
            </label>
            <p className="text-muted-foreground text-xs">
              {t("sources.ingest_parent_article_desc")}
            </p>
            <Select
              onValueChange={(v) =>
                setParentArticleId(v === "__none__" ? "" : v)
              }
              value={parentArticleId || "__none__"}
            >
              <SelectTrigger className="h-8 text-sm" id="ingest-parent-article">
                <SelectValue
                  placeholder={t("sources.ingest_parent_article_placeholder")}
                >
                  {parentArticleId
                    ? (articles.find((a) => a.id === parentArticleId)?.title ??
                      t("sources.ingest_parent_article_placeholder"))
                    : t("sources.ingest_parent_article_none")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t("sources.ingest_parent_article_none")}
                </SelectItem>
                {articles.map((article) => (
                  <SelectItem key={article.id} value={article.id}>
                    {article.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="font-medium text-sm"
              htmlFor="ingest-instructions"
            >
              {t("sources.ingest_instructions_label")}
            </label>
            <p className="text-muted-foreground text-xs">
              {t("sources.ingest_instructions_desc")}
            </p>
            <Textarea
              className="min-h-[80px] resize-y text-sm"
              id="ingest-instructions"
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t("sources.ingest_instructions_placeholder")}
              value={instructions}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          disabled={ingestMutation.isPending || ingestBlocked}
          onClick={handleConfirm}
          size="sm"
          type="button"
        >
          {ingestMutation.isPending ? (
            <>
              <AnimatedLoaderIcon className="mr-1" play="always" size="sm" />
              {t("sources.ingest_running")}
            </>
          ) : (
            t("sources.ingest_confirm")
          )}
        </Button>
      </div>
    </div>
  );
}

/** Compact two-up picker for the grouping choice inside authored ingestion. */
function ScopeCard({
  active,
  description,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  disabled?: boolean;
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
          : "border-border bg-card hover:bg-muted/40",
        disabled && !active && "cursor-not-allowed opacity-60"
      )}
      disabled={disabled}
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

function StrategyCard({
  active,
  badge,
  description,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  badge?: string;
  description: string;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:border-muted-foreground/40",
        disabled && !active && "cursor-not-allowed opacity-60"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {badge && (
        <span className="absolute top-2 right-2 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
          {badge}
        </span>
      )}
      <span
        className={cn(
          "text-muted-foreground transition-colors",
          active && "text-primary"
        )}
      >
        {icon}
      </span>
      <span className="font-medium text-sm leading-tight">{label}</span>
      <span className="text-muted-foreground text-xs leading-snug">
        {description}
      </span>
    </button>
  );
}
