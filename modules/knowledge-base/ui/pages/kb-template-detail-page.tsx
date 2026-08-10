import { ApiClientResponseError } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  markdownToJson,
  RichEditorContent,
  useRichEditor,
} from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import type { JSONContent } from "@engenty/tiptap-editor";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormCard,
  SettingsFormSection,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  kbArticleTemplateCreateSchema,
  kbArticleTemplateUpdateSchema,
} from "../../src/schema/templates.js";
import type { KbTemplatePropertyDefinition } from "../../src/schema/types.js";
import {
  ensureDraftTemplateProperties,
  KbTemplatePropertiesEditor,
  newTemplateProperty,
  normalizeTemplatePropertiesForSave,
} from "../components/kb-template-properties-editor.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import {
  kbScopedSettingsPath,
  kbScopedSettingsTemplatesPath,
  kbTemplatePath,
} from "../kb-paths.js";
import {
  kbArticlePageTitleClassName,
  kbArticlePageTitleInputResetClassName,
} from "../lib/article-page-shell.js";
import { buildCategoryDisplayPaths } from "../lib/category-display-paths.js";
import {
  kbModulePageShellInnerClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import {
  isKbTemplateEditorNewRoute,
  isKbTemplateRouteIdValid,
  resolveKbTemplateRouteId,
} from "../lib/kb-template-route-id.js";
import {
  categoriesQueryOptions,
  kbsQueryOptions,
  kbTemplateDetailQueryOptions,
  useKbTemplateMutations,
  useUpdateCategoryMutation,
} from "../queries.js";
import { kbIdFromSlug } from "../resolve-kb-id.js";

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function templateSaveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientResponseError && error.message.trim()) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

function emptyContentForSave(markdown: string, json: JSONContent | null) {
  return markdown.trim() ? json : null;
}

export function KbTemplateDetailPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { kbSlug = "", templateId = "" } = useParams<{
    kbSlug: string;
    templateId: string;
  }>();
  const routeTemplateId = (templateId ?? "").trim();
  const isNew = isKbTemplateEditorNewRoute(routeTemplateId, pathname);
  const { data: kbs = [], isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const scopedKb = useMemo(
    () =>
      kbSlug.trim()
        ? kbs.find((kb) => kb.slug === decodeURIComponent(kbSlug.trim()))
        : undefined,
    [kbs, kbSlug]
  );
  const kbId = scopedKb?.id ?? kbIdFromSlug(kbs, kbSlug) ?? "";
  const {
    data: template,
    isLoading,
    isError: templateLoadError,
  } = useQuery(kbTemplateDetailQueryOptions(isNew ? "" : routeTemplateId));
  const resolvedTemplateId = resolveKbTemplateRouteId(
    routeTemplateId,
    template?.id
  );
  const effectiveKbId = kbId || template?.kb_id || "";
  const { data: categories = [] } = useQuery(
    categoriesQueryOptions(effectiveKbId)
  );
  const mutations = useKbTemplateMutations(effectiveKbId);
  const categoryMutation = useUpdateCategoryMutation(kbId);
  const kbShellNav = useKbModuleSecondaryShellNav({ kbId, kbSlug });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [properties, setProperties] = useState<KbTemplatePropertyDefinition[]>(
    () => (isNew ? [newTemplateProperty(0)] : [])
  );
  const [contentJson, setContentJson] = useState<JSONContent | null>(EMPTY_DOC);
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [categoryToAddId, setCategoryToAddId] = useState("__placeholder__");
  const hydratedTemplateKeyRef = useRef<string | null>(null);
  const hydratedFormKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isNew || kbsLoading) {
      return;
    }
    if (!isKbTemplateRouteIdValid(routeTemplateId)) {
      toast.error(
        t(
          "templates.missing_template_id",
          "This template URL is invalid. Open the template again from settings."
        )
      );
      navigate(kbScopedSettingsTemplatesPath(kbSlug), { replace: true });
    }
  }, [isNew, kbSlug, kbsLoading, navigate, routeTemplateId, t]);

  useEffect(() => {
    const hydrationKey = isNew ? `new:${kbSlug}` : template?.id;
    if (!hydrationKey || hydratedFormKeyRef.current === hydrationKey) {
      return;
    }
    hydratedFormKeyRef.current = hydrationKey;

    if (isNew) {
      setName("");
      setDescription("");
      setProperties([newTemplateProperty(0)]);
      setContentJson(EMPTY_DOC);
      setContentMarkdown("");
      return;
    }
    if (!template) {
      return;
    }
    setName(template.name);
    setDescription(template.description ?? "");
    setProperties(ensureDraftTemplateProperties(template.property_definitions));
    setContentMarkdown(template.content_markdown ?? "");
    setContentJson(
      (template.content_json as JSONContent | null) ??
        (template.content_markdown?.trim()
          ? markdownToJson(template.content_markdown)
          : EMPTY_DOC)
    );
  }, [isNew, kbSlug, template]);

  const { editor, editorContentProps } = useRichEditor({
    autoFocus: false,
    content: contentJson,
    editable: true,
    onChange: (json, markdown) => {
      setContentJson(json);
      setContentMarkdown(markdown);
    },
    placeholder: t(
      "templates.content_placeholder",
      "Write optional template structure. Use [placeholder] tokens where useful."
    ),
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    const hydrationKey = isNew ? "new" : template?.id;
    if (!hydrationKey || hydratedTemplateKeyRef.current === hydrationKey) {
      return;
    }
    hydratedTemplateKeyRef.current = hydrationKey;
    editor.commands.setContent(contentJson ?? EMPTY_DOC, { emitUpdate: false });
  }, [editor, isNew, template?.id, contentJson]);

  const appliedCategories = useMemo(() => {
    if (!resolvedTemplateId) {
      return [];
    }
    const decorated = buildCategoryDisplayPaths(categories);
    return decorated.filter(
      (category) =>
        category.template_mode === "template" &&
        category.template_id === resolvedTemplateId
    );
  }, [categories, resolvedTemplateId]);

  const availableCategories = useMemo(() => {
    if (isNew || !resolvedTemplateId) {
      return [];
    }
    const decorated = buildCategoryDisplayPaths(categories);
    return decorated.filter(
      (category) =>
        !(
          category.template_mode === "template" &&
          category.template_id === resolvedTemplateId
        )
    );
  }, [categories, isNew, resolvedTemplateId]);

  const assignCategory = (categoryId: string) => {
    if (categoryId === "__placeholder__" || isNew || !resolvedTemplateId) {
      return;
    }
    categoryMutation.mutate(
      {
        id: categoryId,
        input: { template_mode: "template", template_id: resolvedTemplateId },
      },
      {
        onSettled: () => setCategoryToAddId("__placeholder__"),
      }
    );
  };

  const removeCategory = (categoryId: string) => {
    categoryMutation.mutate({
      id: categoryId,
      input: { template_mode: "inherit", template_id: null },
    });
  };

  const save = () => {
    const saveFailedMessage = t(
      "templates.save_failed",
      "Could not save template"
    );
    const normalizedProperties = normalizeTemplatePropertiesForSave(properties);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      property_definitions: normalizedProperties,
      content_json: emptyContentForSave(contentMarkdown, contentJson),
      content_markdown: contentMarkdown.trim() || null,
    };
    if (!payload.name) {
      return;
    }

    if (isNew) {
      if (!effectiveKbId) {
        toast.error(
          t(
            "templates.kb_unresolved",
            "Could not resolve this knowledge base. Reload the page and try again."
          )
        );
        return;
      }
      const parsed = kbArticleTemplateCreateSchema.safeParse({
        ...payload,
        kb_id: effectiveKbId,
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? saveFailedMessage);
        return;
      }
      // The create schema keeps these nullable fields optional; the API client
      // input requires them, so re-apply the payload's explicit nulls.
      const createInput = {
        ...parsed.data,
        content_json: parsed.data.content_json ?? null,
        content_markdown: parsed.data.content_markdown ?? null,
        description: parsed.data.description ?? null,
      };
      mutations.create.mutate(createInput, {
        onSuccess: (created) => {
          if (!created?.id?.trim()) {
            toast.error(
              t(
                "templates.create_missing_id",
                "Template was created but the server response was incomplete. Reload templates and try again."
              )
            );
            return;
          }
          toast.success(t("templates.created", "Template created"));
          navigate(kbTemplatePath(kbSlug, created.id), { replace: true });
        },
        onError: (error) =>
          toast.error(templateSaveErrorMessage(error, saveFailedMessage)),
      });
      return;
    }

    if (!resolvedTemplateId) {
      toast.error(
        t(
          "templates.missing_template_id",
          "This template URL is invalid. Open the template again from settings."
        )
      );
      return;
    }
    const parsed = kbArticleTemplateUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? saveFailedMessage);
      return;
    }
    mutations.update.mutate(
      { id: resolvedTemplateId, input: parsed.data },
      {
        onSuccess: () => toast.success(t("templates.saved", "Template saved")),
        onError: (error) =>
          toast.error(templateSaveErrorMessage(error, saveFailedMessage)),
      }
    );
  };

  const pageActions = (
    <div className="flex items-center gap-2">
      <Button
        className={topbarIconButtonClassName}
        onClick={() => navigate(kbScopedSettingsTemplatesPath(kbSlug))}
        size="sm"
        variant="outline"
      >
        <X aria-hidden className="h-4 w-4" />
        <TopbarActionLabel>{t("actions.cancel")}</TopbarActionLabel>
      </Button>
      {isNew ? null : (
        <Button
          className={topbarIconButtonClassName}
          disabled={!resolvedTemplateId}
          onClick={() =>
            mutations.delete.mutate(resolvedTemplateId, {
              onSuccess: () => {
                toast.success(t("templates.deleted", "Template deleted"));
                navigate(kbScopedSettingsTemplatesPath(kbSlug), {
                  replace: true,
                });
              },
              onError: (error) =>
                toast.error(
                  templateSaveErrorMessage(
                    error,
                    t("templates.save_failed", "Could not save template")
                  )
                ),
            })
          }
          size="sm"
          variant="outline"
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          <TopbarActionLabel>{t("templates.delete")}</TopbarActionLabel>
        </Button>
      )}
      <Button
        className={topbarIconButtonClassName}
        disabled={!name.trim() || (isNew && !effectiveKbId)}
        onClick={save}
        size="sm"
      >
        <Save aria-hidden className="h-4 w-4" />
        <TopbarActionLabel>{t("actions.save")}</TopbarActionLabel>
      </Button>
    </div>
  );

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs: [
      ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
      {
        label: t("scoped_settings.breadcrumb"),
        to: kbScopedSettingsPath(kbSlug),
      },
      {
        label: t("templates.settings_title"),
        to: kbScopedSettingsTemplatesPath(kbSlug),
      },
      { label: isNew ? t("templates.new_template") : name || "..." },
    ],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (kbsLoading || (!isNew && isLoading)) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <div className={kbModulePageShellInnerClassName}>
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-96 w-full" />
        </div>
      </section>
    );
  }

  if (!isNew && templateLoadError) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <div className={kbModulePageShellInnerClassName}>
          <p className="text-destructive text-sm">
            {t(
              "templates.load_failed",
              "Could not load this template. It may have been deleted."
            )}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={kbModulePageShellSectionClassName}>
      <div className={kbModulePageShellInnerClassName}>
        <div className="w-full space-y-3">
          <input
            className={`${kbArticlePageTitleInputResetClassName} ${kbArticlePageTitleClassName}`}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("templates.new_template")}
            value={name}
          />
          <textarea
            className="min-h-10 w-full resize-none border-0 bg-transparent p-0 text-muted-foreground text-sm leading-6 outline-none ring-0 placeholder:text-muted-foreground focus:ring-0"
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("templates.description")}
            value={description}
          />
        </div>

        <SettingsFormSection
          cardClassName="space-y-2"
          cardVariant="compact"
          description={t(
            "templates.editor_description",
            "Define metadata extraction fields and an optional document structure."
          )}
          title={t("templates.properties")}
        >
          <KbTemplatePropertiesEditor
            properties={properties}
            setProperties={setProperties}
          />
        </SettingsFormSection>

        <section className="space-y-2">
          <div>
            <h2 className="font-medium text-lg">
              {t("templates.content_structure")}
            </h2>
            <p className="whitespace-normal text-pretty break-words text-muted-foreground text-sm">
              {t(
                "templates.content_structure_description",
                "Optional document skeleton prepended or used during ingestion."
              )}
            </p>
          </div>
          <div className="tiptap-rich-editor flex min-h-[18rem] flex-col">
            {editor ? (
              <RichEditorContent
                className="flex min-h-0 flex-1 flex-col"
                editor={editor}
                editorContentClassName="min-h-[12rem] flex-1"
                {...editorContentProps}
              />
            ) : (
              <Skeleton className="min-h-[12rem] w-full flex-1" />
            )}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-medium text-lg">
                {t("templates.applied_categories", "Applied categories")}
              </h2>
              <p className="whitespace-normal text-pretty break-words text-muted-foreground text-sm">
                {t(
                  "templates.applied_categories_description",
                  "Categories that explicitly use this template."
                )}
              </p>
            </div>
            {isNew || !resolvedTemplateId ? null : (
              <Select
                disabled={
                  categoryMutation.isPending || availableCategories.length === 0
                }
                onValueChange={(value) => {
                  setCategoryToAddId(value);
                  assignCategory(value);
                }}
                value={categoryToAddId}
              >
                <SelectTrigger className="h-8 w-52 shrink-0 text-xs">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  <SelectValue
                    placeholder={t("templates.add_category", "Add category")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem disabled value="__placeholder__">
                    {t("templates.add_category", "Add category")}
                  </SelectItem>
                  {availableCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.display_path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <SettingsFormCard className="space-y-3" variant="compact">
            {appliedCategories.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t(
                  "templates.applied_categories_empty",
                  "No categories explicitly use this template."
                )}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {appliedCategories.map((category) => (
                  <div
                    className="flex items-center justify-between gap-3 py-2"
                    key={category.id}
                  >
                    <Link
                      className="min-w-0 truncate text-sm hover:underline"
                      to={`${kbScopedSettingsPath(kbSlug)}#categories`}
                    >
                      {category.display_path}
                    </Link>
                    <Button
                      aria-label={t(
                        "templates.remove_category",
                        "Remove category"
                      )}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      disabled={categoryMutation.isPending}
                      onClick={() => removeCategory(category.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </SettingsFormCard>
        </section>
      </div>
    </section>
  );
}
