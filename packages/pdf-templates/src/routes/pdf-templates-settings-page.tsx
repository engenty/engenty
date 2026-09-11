import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Plus, Save, SquarePen } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { CodeEditor } from "../components/code-editor.js";
import { DesignTab } from "../components/design-tab.js";
import { HelpTab } from "../components/help-tab.js";
import { type PreviewMode, PreviewPane } from "../components/preview-pane.js";
import {
  CreateTemplateDialog,
  RenameTemplateDialog,
} from "../components/template-dialogs.js";
import {
  useCreatePdfTemplateMutation,
  useDeletePdfTemplateMutation,
  usePdfTemplatesQuery,
  usePreviewPdfTemplateDataMutation,
  usePreviewPdfTemplatePdfMutation,
  useUpdatePdfTemplateMutation,
  useUploadPdfTemplateAssetMutation,
} from "../queries.js";
import {
  getPdfTemplateUiProvider,
  getPdfTemplateUiProviders,
} from "../registry.js";
import type { PdfTemplateSettings } from "../types.js";

const DEFAULT_TEMPLATE_ID = "__default__";

export function PdfTemplatesSettingsPage() {
  const { t } = useTranslation("pdf-templates");
  const providers = getPdfTemplateUiProviders();
  const [selectedModuleKey, setSelectedModuleKey] = useState(
    providers[0]?.moduleKey ?? ""
  );
  const provider = getPdfTemplateUiProvider(selectedModuleKey);
  const templatesQuery = usePdfTemplatesQuery(selectedModuleKey);
  const templates = templatesQuery.data ?? [];
  const [selectedTemplateId, setSelectedTemplateId] =
    useState(DEFAULT_TEMPLATE_ID);
  const [editorTab, setEditorTab] = useState("design");
  const [documentTemplate, setDocumentTemplate] = useState("");
  const [stylesheetTemplate, setStylesheetTemplate] = useState("");
  const [settings, setSettings] = useState<PdfTemplateSettings | null>(null);
  const [baseline, setBaseline] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("pdf");
  const [previewSource, setPreviewSource] = useState("sample");
  const [previewOptions, setPreviewOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [previewData, setPreviewData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [renderedXml, setRenderedXml] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const createMutation = useCreatePdfTemplateMutation(selectedModuleKey);
  const updateMutation = useUpdatePdfTemplateMutation(
    selectedModuleKey,
    selectedTemplateId && selectedTemplateId !== DEFAULT_TEMPLATE_ID
      ? selectedTemplateId
      : null
  );
  const deleteMutation = useDeletePdfTemplateMutation(selectedModuleKey);
  const previewDataMutation = usePreviewPdfTemplateDataMutation();
  const previewPdfMutation = usePreviewPdfTemplatePdfMutation();
  const uploadMutation = useUploadPdfTemplateAssetMutation();
  const lastLoadedKeyRef = useRef("");

  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("breadcrumbs.settings"));
  const breadcrumbs = useMemo(
    () => [...(moduleRootCrumb ? [moduleRootCrumb] : []), { label: t("menu") }],
    [moduleRootCrumb, t]
  );
  usePageConfig({
    breadcrumbs,
    secondaryNavHeaderSlot,
  });

  useEffect(() => {
    if (!selectedModuleKey && providers[0]) {
      setSelectedModuleKey(providers[0].moduleKey);
    }
  }, [providers, selectedModuleKey]);

  useEffect(() => {
    if (!provider) {
      return;
    }
    if (templates.length === 0) {
      setSelectedTemplateId(DEFAULT_TEMPLATE_ID);
      return;
    }
    if (selectedTemplateId === DEFAULT_TEMPLATE_ID) {
      return;
    }
    if (selectedTemplateId === DEFAULT_TEMPLATE_ID) {
      return;
    }
    const existing = templates.some(
      (template) => template.id === selectedTemplateId
    );
    if (existing) {
      return;
    }
    setSelectedTemplateId(
      templates.find((template) => template.is_default)?.id ??
        templates[0]?.id ??
        ""
    );
  }, [provider, selectedTemplateId, templates]);

  const refreshPreview = useCallback(
    async (overrides?: {
      document_template?: string;
      stylesheet_template?: string;
      settings_json?: PdfTemplateSettings;
    }) => {
      const doc = overrides?.document_template ?? documentTemplate;
      const style = overrides?.stylesheet_template ?? stylesheetTemplate;
      const sets = overrides?.settings_json ?? settings;
      if (!(provider && sets)) {
        return;
      }
      setPreviewError(null);
      try {
        const request = {
          module_key: selectedModuleKey,
          document_template: doc,
          stylesheet_template: style,
          settings_json: sets,
          preview_source:
            previewSource === "sample"
              ? { kind: "sample" as const }
              : { kind: "record" as const, record_id: previewSource },
        };
        const dataResult = await previewDataMutation.mutateAsync(request);
        setPreviewData(dataResult.template_data);
        setRenderedXml(dataResult.rendered_xml);
        const pdfBlob = await previewPdfMutation.mutateAsync(request);
        setPdfUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return URL.createObjectURL(pdfBlob);
        });
      } catch (error) {
        setPreviewError(
          error instanceof Error ? error.message : t("errors.previewFailed")
        );
      }
    },
    [
      provider,
      settings,
      selectedModuleKey,
      documentTemplate,
      stylesheetTemplate,
      previewSource,
      previewDataMutation,
      previewPdfMutation,
      t,
    ]
  );

  const refreshPreviewRef = useRef(refreshPreview);
  refreshPreviewRef.current = refreshPreview;

  useEffect(() => {
    if (!provider) {
      return;
    }

    const activeTemplate =
      selectedTemplateId === DEFAULT_TEMPLATE_ID
        ? null
        : (templates.find((template) => template.id === selectedTemplateId) ??
          null);
    const loadKey = `${selectedModuleKey}:${activeTemplate?.id ?? "defaults"}`;
    if (lastLoadedKeyRef.current === loadKey) {
      return;
    }
    lastLoadedKeyRef.current = loadKey;
    const doc =
      activeTemplate?.document_template ?? provider.defaultDocumentTemplate;
    const style =
      activeTemplate?.stylesheet_template ?? provider.defaultStylesheetTemplate;
    const sets = activeTemplate?.settings_json ?? provider.settingsDefaults;
    setDocumentTemplate(doc);
    setStylesheetTemplate(style);
    setSettings(sets);
    setBaseline(
      JSON.stringify({
        document_template: doc,
        stylesheet_template: style,
        settings_json: sets,
      })
    );
    void refreshPreviewRef.current({
      document_template: doc,
      stylesheet_template: style,
      settings_json: sets,
    });
  }, [provider, selectedModuleKey, selectedTemplateId, templates]);

  useEffect(() => {
    if (!provider?.listPreviewRecords) {
      setPreviewOptions([]);
      setPreviewSource("sample");
      return;
    }

    setPreviewSource("sample");
    void provider
      .listPreviewRecords()
      .then((items) => setPreviewOptions(items));
  }, [provider, selectedModuleKey]);

  useEffect(
    () => () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    },
    [pdfUrl]
  );

  const hasChanges =
    settings != null &&
    baseline !==
      JSON.stringify({
        document_template: documentTemplate,
        stylesheet_template: stylesheetTemplate,
        settings_json: settings,
      });

  const hasDocOrStyleChangesFromDefault =
    provider != null &&
    selectedTemplateId !== DEFAULT_TEMPLATE_ID &&
    (documentTemplate !== provider.defaultDocumentTemplate ||
      stylesheetTemplate !== provider.defaultStylesheetTemplate);

  useEffect(() => {
    if (!(provider && settings)) {
      return;
    }
    const id = setTimeout(() => void refreshPreviewRef.current(), 1000);
    return () => clearTimeout(id);
  }, [documentTemplate, stylesheetTemplate, settings, previewSource, provider]);

  async function handleSave() {
    if (!(provider && settings)) {
      return;
    }
    setSaveError(null);

    const payload = {
      module_key: selectedModuleKey,
      name:
        templates.find((template) => template.id === selectedTemplateId)
          ?.name ?? t("defaults.templateName"),
      settings_json: settings,
      schema_version: 1,
      is_default: templates.length === 0,
      document_key: "default",
      engine: "xml_liquid_v1" as const,
      document_template: documentTemplate,
      stylesheet_template: stylesheetTemplate,
    };

    try {
      if (selectedTemplateId && selectedTemplateId !== DEFAULT_TEMPLATE_ID) {
        await updateMutation.mutateAsync(payload);
      } else {
        const created = await createMutation.mutateAsync(payload);
        setSelectedTemplateId(created.id);
      }

      setBaseline(
        JSON.stringify({
          document_template: documentTemplate,
          stylesheet_template: stylesheetTemplate,
          settings_json: settings,
        })
      );
      await refreshPreview();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : t("errors.saveFailed")
      );
    }
  }

  async function handleDownload() {
    if (!(provider && settings)) {
      return;
    }
    const blob = await previewPdfMutation.mutateAsync({
      module_key: selectedModuleKey,
      document_template: documentTemplate,
      stylesheet_template: stylesheetTemplate,
      settings_json: settings,
      preview_source:
        previewSource === "sample"
          ? { kind: "sample" as const }
          : { kind: "record" as const, record_id: previewSource },
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${selectedModuleKey}-template-preview.pdf`;
    window.document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  if (!(provider && settings)) {
    return (
      <div className="w-full max-w-none text-muted-foreground text-sm">
        {t("empty.noProviders")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-none flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card/85 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select
            onValueChange={setSelectedModuleKey}
            value={selectedModuleKey}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providers.map((item) => (
                <SelectItem key={item.moduleKey} value={item.moduleKey}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={setSelectedTemplateId}
            value={selectedTemplateId}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder={t("toolbar.selectTemplate")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_TEMPLATE_ID}>
                {t("toolbar.defaultTemplate")}
              </SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="h-8 w-8"
            disabled={
              !selectedTemplateId || selectedTemplateId === DEFAULT_TEMPLATE_ID
            }
            onClick={() => setRenameOpen(true)}
            size="icon"
            variant="outline"
          >
            <SquarePen className="h-3.5 w-3.5" />
          </Button>
          <Button
            className="h-8 w-8"
            onClick={() => setCreateOpen(true)}
            size="icon"
            variant="outline"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedTemplateId && selectedTemplateId !== DEFAULT_TEMPLATE_ID ? (
            <Button
              disabled={!hasDocOrStyleChangesFromDefault}
              onClick={() => {
                setDocumentTemplate(provider.defaultDocumentTemplate);
                setStylesheetTemplate(provider.defaultStylesheetTemplate);
              }}
              size="sm"
              variant="outline"
            >
              {t("actions.reset")}
            </Button>
          ) : null}
          <Button
            disabled={!hasChanges}
            onClick={() => void handleSave()}
            size="sm"
          >
            <Save className="h-3.5 w-3.5" />
            {t("actions.save")}
          </Button>
        </div>
      </div>

      {saveError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {saveError}
        </div>
      ) : null}
      {previewError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {previewError}
        </div>
      ) : null}

      <div className="max-h-[calc(100dvh-8.2rem)] min-h-[420px] min-w-0 flex-1 overflow-hidden px-3">
        <Group className="h-full" orientation="horizontal">
          <Panel defaultSize={showPreview ? 38 : 100} minSize={25}>
            <Card
              className="flex h-full min-h-0 flex-col overflow-hidden"
              variant="settings"
            >
              <Tabs
                className="flex h-full min-h-0 flex-col"
                onValueChange={setEditorTab}
                value={editorTab}
              >
                <div className="border-b px-2 pt-2 pb-0">
                  <TabsList className="w-full" variant="line">
                    <TabsTrigger value="design">{t("tabs.design")}</TabsTrigger>
                    <TabsTrigger value="document">
                      {t("tabs.document")}
                    </TabsTrigger>
                    <TabsTrigger value="stylesheet">
                      {t("tabs.stylesheet")}
                    </TabsTrigger>
                    <div className="flex-1" />
                    <TabsTrigger value="help">{t("tabs.help")}</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent
                  className="min-h-0 flex-1 overflow-auto"
                  value="design"
                >
                  <DesignTab
                    onSettingsChange={setSettings}
                    onUploadAsset={async (file) => {
                      const result = await uploadMutation.mutateAsync(file);
                      setSettings({
                        ...settings,
                        letterhead: {
                          ...settings.letterhead,
                          asset_url: result.asset_url,
                        },
                      });
                    }}
                    settings={settings}
                    uploading={uploadMutation.isPending}
                  />
                </TabsContent>
                <TabsContent
                  className="min-h-0 flex-1 overflow-auto"
                  value="document"
                >
                  <CodeEditor
                    language="xml"
                    onChange={setDocumentTemplate}
                    value={documentTemplate}
                  />
                </TabsContent>
                <TabsContent
                  className="min-h-0 flex-1 overflow-auto"
                  value="stylesheet"
                >
                  <CodeEditor
                    language="json"
                    onChange={setStylesheetTemplate}
                    value={stylesheetTemplate}
                  />
                </TabsContent>
                <TabsContent
                  className="min-h-0 flex-1 overflow-auto"
                  value="help"
                >
                  <HelpTab
                    onCopy={async (value) =>
                      navigator.clipboard.writeText(value)
                    }
                    sections={provider.getHelpSections()}
                  />
                </TabsContent>
              </Tabs>
            </Card>
          </Panel>

          {showPreview ? (
            <>
              <Separator className="mx-0.5 h-20 w-1 shrink-0 cursor-col-resize self-center rounded-full bg-border hover:bg-muted-foreground/30" />
              <Panel defaultSize={62} minSize={35}>
                <PreviewPane
                  mode={previewMode}
                  onDownload={handleDownload}
                  onModeChange={setPreviewMode}
                  onPreviewSourceChange={setPreviewSource}
                  onRefresh={refreshPreview}
                  onToggle={() => setShowPreview(false)}
                  pdfUrl={pdfUrl}
                  previewData={previewData}
                  previewOptions={previewOptions}
                  renderedXml={renderedXml}
                  selectedPreviewSource={previewSource}
                />
              </Panel>
            </>
          ) : null}
        </Group>
      </div>

      {showPreview ? null : (
        <div className="flex justify-end">
          <Button onClick={() => setShowPreview(true)} variant="outline">
            {t("actions.showPreview")}
          </Button>
        </div>
      )}

      <CreateTemplateDialog
        defaultValue={t("defaults.templateName")}
        onConfirm={async (value) => {
          const created = await createMutation.mutateAsync({
            module_key: selectedModuleKey,
            name: value || t("defaults.templateName"),
            settings_json: settings,
            schema_version: 1,
            is_default: templates.length === 0,
            document_key: "default",
            engine: "xml_liquid_v1",
            document_template: documentTemplate,
            stylesheet_template: stylesheetTemplate,
          });
          setSelectedTemplateId(created.id);
          setCreateOpen(false);
        }}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
      <RenameTemplateDialog
        defaultValue={
          templates.find((template) => template.id === selectedTemplateId)
            ?.name ?? ""
        }
        deleteConfirmDescription={t("dialogs.deleteConfirmDescription")}
        deleteConfirmTitle={t("dialogs.deleteConfirmTitle")}
        deleteLabel={t("dialogs.delete")}
        onConfirm={async (value) => {
          if (
            !selectedTemplateId ||
            selectedTemplateId === DEFAULT_TEMPLATE_ID
          ) {
            return;
          }
          await updateMutation.mutateAsync({
            name: value || t("defaults.templateName"),
          });
          setRenameOpen(false);
        }}
        onDelete={
          selectedTemplateId && selectedTemplateId !== DEFAULT_TEMPLATE_ID
            ? async () => {
                await deleteMutation.mutateAsync(selectedTemplateId);
                setSelectedTemplateId(
                  templates.length > 1
                    ? (templates.find((t) => t.id !== selectedTemplateId)?.id ??
                        DEFAULT_TEMPLATE_ID)
                    : DEFAULT_TEMPLATE_ID
                );
              }
            : undefined
        }
        onOpenChange={setRenameOpen}
        open={renameOpen}
      />
    </div>
  );
}
