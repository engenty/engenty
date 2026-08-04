/**
 * Per–knowledge-base settings: name, slug, description, sidebar defaults, article properties.
 * Default KB for the tenant is configured on the module settings page (General).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Input,
  Label,
  SettingsFormSection,
  Skeleton,
  Textarea,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  KB_SIDEBAR_ARTICLE_TREE_DEFAULTS,
  type KbSidebarArticleTreePrefs,
  mergeKbSidebarArticleTreePrefs,
} from "../../src/schema/kb-sidebar-article-tree.js";
import { kbMergeArticlePropertyDefinitions } from "../../src/schema/knowledge-bases.js";
import type {
  ArticlePropertyDefinition,
  KbRootCommentsMode,
  KbSettings,
} from "../../src/schema/types.js";
import { updateKb, updateKbSettings } from "../api.js";
import {
  KbArticlePropertyDefinitionsForm,
  normalizeKbArticlePropertyDefinitionsForSave,
} from "../components/kb-article-property-definitions-form.js";
import { KbCommentsModeFields } from "../components/kb-comments-mode-fields.js";
import { KbFilesystemSyncSection } from "../components/kb-filesystem-sync-section.js";
import { KbSidebarArticleTreeDefaultsFields } from "../components/kb-sidebar/article-tree/kb-sidebar-article-tree-defaults-fields.js";
import { KbTemplateSettingsSection } from "../components/kb-template-settings-section.js";
import { useKbScopedSettingsAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-shell.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import {
  KB_MODULE_BASE,
  kbHubPath,
  kbScopedSettingsPath,
} from "../kb-paths.js";
import {
  kbModulePageShellInnerClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { kbSettingsQueryOptions, kbsQueryOptions } from "../queries.js";
import { slugFromKbId } from "../resolve-kb-id.js";

function kbSidebarTreePrefsEqual(
  a: KbSidebarArticleTreePrefs,
  b: KbSidebarArticleTreePrefs
): boolean {
  return (
    a.viewMode === b.viewMode &&
    a.sortBy === b.sortBy &&
    a.sortOrder === b.sortOrder &&
    a.maxPerLevel === b.maxPerLevel
  );
}

function normalizeDescription(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function KbScopedSettingsPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { kbSlug: kbSlugParam } = useParams<{ kbSlug: string }>();

  const { data: kbsRaw, isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const { data: kbSettings, isLoading: kbSettingsLoading } = useQuery(
    kbSettingsQueryOptions
  );
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];

  const slugNorm = useMemo(
    () => (kbSlugParam?.trim() ? decodeURIComponent(kbSlugParam.trim()) : ""),
    [kbSlugParam]
  );

  const kb = useMemo(
    () => (slugNorm ? kbs.find((k) => k.slug === slugNorm) : undefined),
    [kbs, slugNorm]
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [sidebarTreePrefs, setSidebarTreePrefs] =
    useState<KbSidebarArticleTreePrefs>(KB_SIDEBAR_ARTICLE_TREE_DEFAULTS);
  const [articlePropertyDefs, setArticlePropertyDefs] = useState<
    ArticlePropertyDefinition[]
  >([]);
  const [commentsMode, setCommentsMode] =
    useState<KbRootCommentsMode>("enabled");

  const kbArticleDefsSyncKey = kb
    ? JSON.stringify(kb.article_property_definitions ?? [])
    : "";

  useEffect(() => {
    if (!kb) {
      return;
    }
    setName(kb.name);
    setSlug(kb.slug);
    setDescription(kb.description ?? "");
    setArticlePropertyDefs(
      kbMergeArticlePropertyDefinitions(kb.article_property_definitions)
    );
    setCommentsMode(kb.comments_mode ?? "enabled");
    if (kbSettings) {
      setSidebarTreePrefs(
        mergeKbSidebarArticleTreePrefs(
          kbSettings.sidebar_article_tree_defaults_by_kb[kb.id] ?? null
        )
      );
    }
  }, [kb, kbSettings, kbArticleDefsSyncKey]);

  useEffect(() => {
    if (kbsLoading || !slugNorm) {
      return;
    }
    if (!kb) {
      navigate(KB_MODULE_BASE, { replace: true });
    }
  }, [kbsLoading, slugNorm, kb, navigate]);

  const kbId = kb?.id ?? "";
  const kbSlug = kb?.slug ?? "";

  const onKbPickerChange = useCallback(
    (nextKbId: string) => {
      const nextSlug = slugFromKbId(kbs, nextKbId);
      if (nextSlug) {
        navigate(kbScopedSettingsPath(nextSlug));
      }
    },
    [kbs, navigate]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId,
    kbSlug,
  });

  const articlePropertyDefinitionsDirty = useMemo(() => {
    if (!kb) {
      return false;
    }
    const baseline = kbMergeArticlePropertyDefinitions(
      kb.article_property_definitions
    );
    const curNorm =
      normalizeKbArticlePropertyDefinitionsForSave(articlePropertyDefs);
    const baseNorm = normalizeKbArticlePropertyDefinitionsForSave(baseline);
    if (!(curNorm.ok && baseNorm.ok)) {
      return JSON.stringify(articlePropertyDefs) !== JSON.stringify(baseline);
    }
    return JSON.stringify(curNorm.data) !== JSON.stringify(baseNorm.data);
  }, [kb, articlePropertyDefs]);

  const isDirty = useMemo(() => {
    if (!kb) {
      return false;
    }
    const nextDesc = normalizeDescription(description);
    const prevDesc =
      kb.description == null || kb.description.trim() === ""
        ? null
        : kb.description.trim();
    const storedSidebar = kbSettings
      ? mergeKbSidebarArticleTreePrefs(
          kbSettings.sidebar_article_tree_defaults_by_kb[kb.id] ?? null
        )
      : KB_SIDEBAR_ARTICLE_TREE_DEFAULTS;
    return (
      name.trim() !== kb.name.trim() ||
      slug.trim() !== kb.slug.trim() ||
      nextDesc !== prevDesc ||
      commentsMode !== (kb.comments_mode ?? "enabled") ||
      !kbSidebarTreePrefsEqual(sidebarTreePrefs, storedSidebar) ||
      articlePropertyDefinitionsDirty
    );
  }, [
    kb,
    kbSettings,
    name,
    slug,
    description,
    commentsMode,
    sidebarTreePrefs,
    articlePropertyDefinitionsDirty,
  ]);

  useKbScopedSettingsAgentUiSlice({
    isDirty,
    kbId,
    kbName: name,
    kbSlug,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!kb) {
        throw new Error("Missing knowledge base");
      }
      const settingsSnap = queryClient.getQueryData<KbSettings>([
        "kb",
        "settings",
      ]);
      if (!settingsSnap) {
        throw new Error("KB settings not loaded");
      }
      const defsResult =
        normalizeKbArticlePropertyDefinitionsForSave(articlePropertyDefs);
      if (!defsResult.ok) {
        throw new Error(defsResult.message);
      }
      const kbRow = await updateKb(kb.id, {
        name: name.trim(),
        slug: slug.trim(),
        description: normalizeDescription(description),
        comments_mode: commentsMode,
        article_property_definitions: defsResult.data,
      });
      await updateKbSettings({
        ...settingsSnap,
        sidebar_article_tree_defaults_by_kb: {
          ...settingsSnap.sidebar_article_tree_defaults_by_kb,
          [kb.id]: sidebarTreePrefs,
        },
      });
      return kbRow;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["kb", "knowledge-bases"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["kb", "knowledge-bases", data.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["kb", "settings"] });
      setName(data.name);
      setSlug(data.slug);
      setDescription(data.description ?? "");
      setArticlePropertyDefs(
        kbMergeArticlePropertyDefinitions(data.article_property_definitions)
      );
      toast.success(t("scoped_settings.saved"));
      if (data.slug !== slugNorm) {
        navigate(kbScopedSettingsPath(data.slug), { replace: true });
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("scoped_settings.save_failed")
      );
    },
  });

  const handleCancel = useCallback(() => {
    if (!kb) {
      navigate(-1);
      return;
    }
    navigate(kbHubPath(kb.slug));
  }, [kb, navigate]);

  const saveDisabled =
    !(kb && name.trim() && slug.trim() && kbSettings) ||
    kbSettingsLoading ||
    saveMutation.isPending ||
    !isDirty;

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button
          className={topbarIconButtonClassName}
          onClick={handleCancel}
          size="sm"
          variant="outline"
        >
          <X aria-hidden className="h-4 w-4 md:mr-1.5" />
          <TopbarActionLabel>{t("actions.cancel")}</TopbarActionLabel>
        </Button>
        <Button
          className={topbarIconButtonClassName}
          disabled={saveDisabled}
          onClick={() => saveMutation.mutate()}
          size="sm"
        >
          <Save aria-hidden className="h-4 w-4 md:mr-1.5" />
          <TopbarActionLabel>
            {saveMutation.isPending
              ? t("scoped_settings.saving")
              : t("actions.save")}
          </TopbarActionLabel>
        </Button>
      </div>
    ),
    [handleCancel, kbSettingsLoading, saveDisabled, saveMutation, t]
  );

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: kbSlug && !kbsLoading && !kbSettingsLoading ? pageActions : null,
    breadcrumbs: useMemo(
      () => [
        ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
        { label: t("scoped_settings.breadcrumb") },
      ],
      [kbShellNav.kbRootCrumb, t]
    ),
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (!slugNorm) {
    return null;
  }

  if (kbsLoading || kbSettingsLoading || !kb) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <div className={kbModulePageShellInnerClassName}>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      </section>
    );
  }

  return (
    <section className={kbModulePageShellSectionClassName}>
      <div className={kbModulePageShellInnerClassName}>
        <SettingsFormSection
          description={t("scoped_settings.section_description")}
          title={t("scoped_settings.section_title")}
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Label
                className="w-full shrink-0 sm:w-32"
                htmlFor="kb-scoped-name"
              >
                {t("scoped_settings.field_name")}
              </Label>
              <Input
                className="flex-1"
                id="kb-scoped-name"
                onChange={(e) => setName(e.target.value)}
                value={name}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Label
                className="w-full shrink-0 sm:w-32"
                htmlFor="kb-scoped-slug"
              >
                {t("scoped_settings.field_slug")}
              </Label>
              <Input
                className="flex-1 font-mono text-sm"
                id="kb-scoped-slug"
                onChange={(e) => setSlug(e.target.value)}
                spellCheck={false}
                value={slug}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
              <Label
                className="w-full shrink-0 pt-2 sm:w-32"
                htmlFor="kb-scoped-description"
              >
                {t("scoped_settings.field_description")}
              </Label>
              <Textarea
                className="min-h-[100px] flex-1"
                id="kb-scoped-description"
                onChange={(e) => setDescription(e.target.value)}
                value={description}
              />
            </div>
          </div>
        </SettingsFormSection>

        <KbTemplateSettingsSection kbId={kb.id} kbSlug={kb.slug} />

        <SettingsFormSection
          description={t(
            "scoped_settings.sidebar_defaults_section_description"
          )}
          title={t("scoped_settings.sidebar_defaults_section_title")}
        >
          <KbSidebarArticleTreeDefaultsFields
            layout="form"
            prefs={sidebarTreePrefs}
            setPrefs={setSidebarTreePrefs}
          />
        </SettingsFormSection>

        <SettingsFormSection
          description={t("scoped_settings.comments_section_description")}
          title={t("scoped_settings.comments_section_title")}
        >
          <KbCommentsModeFields
            onChange={setCommentsMode}
            showInherit={false}
            value={commentsMode}
          />
        </SettingsFormSection>

        <SettingsFormSection
          description={t("scoped_settings.article_properties_description")}
          title={t("scoped_settings.article_properties_title")}
        >
          <KbArticlePropertyDefinitionsForm
            definitions={articlePropertyDefs}
            key={kbArticleDefsSyncKey}
            onDefinitionsChange={setArticlePropertyDefs}
          />
        </SettingsFormSection>

        <KbFilesystemSyncSection kbId={kb.id} />
      </div>
    </section>
  );
}
