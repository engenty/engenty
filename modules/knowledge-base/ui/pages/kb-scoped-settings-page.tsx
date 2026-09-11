/**
 * The space's knowledge base settings: identity, space, templates, chunking,
 * sidebar defaults, comments, article properties, and deletion. Everything
 * content-shaped lives here; the module settings page holds only the
 * tenant-wide index infrastructure.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormRow,
  SettingsFormSection,
  Skeleton,
  Textarea,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { RefreshCw, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  KB_CHUNK_STRATEGIES,
  KB_CHUNKING_DEFAULTS,
  type KbChunking,
  type KbChunkStrategy,
} from "../../src/schema/chunking.js";
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
import { kbSpacesQueryOptions } from "../api/spaces.js";
import { deleteKb, updateKb, updateKbSettings } from "../api.js";
import {
  KbArticlePropertyDefinitionsForm,
  normalizeKbArticlePropertyDefinitionsForSave,
} from "../components/kb-article-property-definitions-form.js";
import { KbCommentsModeFields } from "../components/kb-comments-mode-fields.js";
import { KbSidebarArticleTreeDefaultsFields } from "../components/kb-sidebar/article-tree/kb-sidebar-article-tree-defaults-fields.js";
import { KbTemplateSettingsSection } from "../components/kb-template-settings-section.js";
import { runKbArticleReindex } from "../components/settings/kb-article-reindex.js";
import { useKbScopedSettingsAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-shell.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { KB_MODULE_BASE, kbHubPath } from "../kb-paths.js";
import {
  kbModulePageShellInnerClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import {
  kbSettingsQueryOptions,
  kbsQueryOptions,
  useKbsQuery,
} from "../queries.js";

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

function chunkingEqual(a: KbChunking, b: KbChunking): boolean {
  return (
    a.strategy === b.strategy &&
    a.max_length === b.max_length &&
    a.overlap === b.overlap
  );
}

/** A library "has its own chunking" only when it differs from the defaults. */
function chunkingOrNull(value: KbChunking): KbChunking | null {
  return chunkingEqual(value, KB_CHUNKING_DEFAULTS) ? null : value;
}

export function KbScopedSettingsPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: kbsRaw, isLoading: kbsLoading } = useKbsQuery();
  const { data: kbSettings, isLoading: kbSettingsLoading } = useQuery(
    kbSettingsQueryOptions
  );
  const { data: spaces = [] } = useQuery(kbSpacesQueryOptions);
  // Tenant-wide list: a move target must be a space that has no library yet.
  const { data: allKbs = [] } = useQuery(kbsQueryOptions(null));
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];

  const kb = useMemo(() => kbs[0], [kbs]);
  const moveTargets = useMemo(() => {
    const occupied = new Set(allKbs.map((row) => row.space_id));
    return spaces.filter(
      (space) => space.id === kb?.space_id || !occupied.has(space.id)
    );
  }, [allKbs, kb?.space_id, spaces]);

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
  const [spaceId, setSpaceId] = useState("");
  const [chunking, setChunking] = useState<KbChunking>(KB_CHUNKING_DEFAULTS);
  const [reindexing, setReindexing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    setSpaceId(kb.space_id);
    setChunking(kb.chunking ?? KB_CHUNKING_DEFAULTS);
    if (kbSettings) {
      setSidebarTreePrefs(
        mergeKbSidebarArticleTreePrefs(
          kbSettings.sidebar_article_tree_defaults_by_kb[kb.id] ?? null
        )
      );
    }
  }, [kb, kbSettings, kbArticleDefsSyncKey]);

  useEffect(() => {
    if (!(kbsLoading || kb)) {
      navigate(KB_MODULE_BASE, { replace: true });
    }
  }, [kbsLoading, kb, navigate]);

  const kbId = kb?.id ?? "";
  const kbSlug = kb?.slug ?? "";

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId,
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
      spaceId !== kb.space_id ||
      !chunkingEqual(chunking, kb.chunking ?? KB_CHUNKING_DEFAULTS) ||
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
    spaceId,
    chunking,
    sidebarTreePrefs,
    articlePropertyDefinitionsDirty,
  ]);

  const chunkingDirty = kb
    ? !chunkingEqual(chunking, kb.chunking ?? KB_CHUNKING_DEFAULTS)
    : false;

  useKbScopedSettingsAgentUiSlice({
    isDirty,
    kbId,
    kbName: name,
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
        chunking: chunkingOrNull(chunking),
        // Only sent when it changed: the server re-indexes every article of a
        // moved library, which an unchanged value must not trigger.
        ...(spaceId && spaceId !== kb.space_id ? { space_id: spaceId } : {}),
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
      setSpaceId(data.space_id);
      setChunking(data.chunking ?? KB_CHUNKING_DEFAULTS);
      toast.success(t("scoped_settings.saved"));
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("scoped_settings.save_failed")
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!kb) {
        throw new Error("Missing knowledge base");
      }
      await deleteKb(kb.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["kb", "knowledge-bases"],
      });
      toast.success(t("scoped_settings.deleted"));
      navigate(KB_MODULE_BASE, { replace: true });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("scoped_settings.delete_failed")
      );
    },
  });

  const runKbReindex = useCallback(async () => {
    if (!kb) {
      return;
    }
    setReindexing(true);
    try {
      await runKbArticleReindex({ metadata: { kb_id: kb.id } });
      toast.success(t("scoped_settings.chunking_reindex_success"));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("scoped_settings.chunking_reindex_failed")
      );
    } finally {
      setReindexing(false);
    }
  }, [kb, t]);

  const handleCancel = useCallback(() => {
    if (!kb) {
      navigate(-1);
      return;
    }
    navigate(kbHubPath());
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

        <SettingsFormSection
          cardClassName="space-y-0 divide-y divide-border"
          cardVariant="compact"
          description={t("scoped_settings.space_section_description")}
          title={t("scoped_settings.space_section_title")}
        >
          <SettingsFormRow
            controlSizing="wide"
            hint={t("scoped_settings.space_hint")}
            label={t("scoped_settings.space_label")}
            labelFor="kb-scoped-space"
          >
            <Select onValueChange={setSpaceId} value={spaceId}>
              <SelectTrigger className="w-full" id="kb-scoped-space">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {moveTargets.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsFormRow>
        </SettingsFormSection>

        <KbTemplateSettingsSection kbId={kb.id} />

        <SettingsFormSection
          cardClassName="space-y-0 divide-y divide-border"
          cardVariant="compact"
          description={t("scoped_settings.chunking_section_description")}
          title={t("scoped_settings.chunking_section_title")}
          titleAction={
            <Button
              disabled={reindexing || chunkingDirty}
              onClick={runKbReindex}
              size="sm"
              title={
                chunkingDirty
                  ? t("scoped_settings.chunking_reindex_save_first")
                  : undefined
              }
              type="button"
              variant="outline"
            >
              <RefreshCw
                className={`mr-1.5 size-3.5 ${reindexing ? "animate-spin" : ""}`}
              />
              {t("scoped_settings.chunking_reindex")}
            </Button>
          }
        >
          <SettingsFormRow
            controlSizing="wide"
            hint={t("scoped_settings.chunking_strategy_hint")}
            label={t("scoped_settings.chunking_strategy")}
            labelFor="kb-scoped-chunk-strategy"
          >
            <Select
              onValueChange={(value) => {
                const next = KB_CHUNK_STRATEGIES.find((s) => s === value);
                if (next) {
                  setChunking((prev) => ({ ...prev, strategy: next }));
                }
              }}
              value={chunking.strategy}
            >
              <SelectTrigger className="w-full" id="kb-scoped-chunk-strategy">
                <SelectValue>
                  {(value: string | null) =>
                    t(
                      `scoped_settings.chunking_strategies.${value ?? "recursive"}`
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-fit">
                {KB_CHUNK_STRATEGIES.map((strategy: KbChunkStrategy) => (
                  <SelectItem key={strategy} value={strategy}>
                    {t(`scoped_settings.chunking_strategies.${strategy}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsFormRow>
          <SettingsFormRow
            controlSizing="compact"
            hint={t("scoped_settings.chunking_max_length_hint")}
            label={t("scoped_settings.chunking_max_length")}
            labelFor="kb-scoped-chunk-max-length"
          >
            <Input
              className="w-full tabular-nums"
              id="kb-scoped-chunk-max-length"
              max={8000}
              min={100}
              onChange={(e) =>
                setChunking((prev) => ({
                  ...prev,
                  max_length:
                    Number.parseInt(e.target.value, 10) ||
                    KB_CHUNKING_DEFAULTS.max_length,
                }))
              }
              step={100}
              type="number"
              value={chunking.max_length}
            />
          </SettingsFormRow>
          <SettingsFormRow
            controlSizing="compact"
            hint={t("scoped_settings.chunking_overlap_hint")}
            label={t("scoped_settings.chunking_overlap")}
            labelFor="kb-scoped-chunk-overlap"
          >
            <Input
              className="w-full tabular-nums"
              id="kb-scoped-chunk-overlap"
              max={2000}
              min={0}
              onChange={(e) =>
                setChunking((prev) => ({
                  ...prev,
                  overlap: Number.parseInt(e.target.value, 10) || 0,
                }))
              }
              step={10}
              type="number"
              value={chunking.overlap}
            />
          </SettingsFormRow>
        </SettingsFormSection>

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
            onChange={(value) => {
              // `showInherit={false}` — "inherit" is never offered here.
              if (value !== "inherit") {
                setCommentsMode(value);
              }
            }}
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

        <SettingsFormSection
          description={t("scoped_settings.danger_description")}
          title={t("scoped_settings.danger_title")}
        >
          <Button
            className="text-destructive hover:bg-destructive/10"
            disabled={deleteMutation.isPending}
            onClick={() => setDeleteOpen(true)}
            type="button"
            variant="outline"
          >
            <Trash2 className="mr-1.5 size-4" />
            {t("scoped_settings.delete_action")}
          </Button>
        </SettingsFormSection>

        <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("scoped_settings.delete_confirm_title", { name: kb.name })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("scoped_settings.delete_confirm_description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(ev) => {
                  ev.preventDefault();
                  deleteMutation.mutate();
                }}
              >
                {t("actions.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
