import { MessageResponse } from "@engenty/ai-ui";
import {
  guessFileStorageMimeFromFilename,
  knowledgeBaseSlugFromFileStorageKey,
  pathSegmentsAfterFileStorageTenantRoot,
} from "@engenty/file-storage";
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
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { AnimatedDownloadIcon, AnimatedLoaderIcon } from "@engenty/ui-icons";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { ArrowLeft, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteFile, getFilesUrl, postFilesExtract } from "../api.js";
import { useFilesDetailAgentUiSlice } from "../hooks/use-files-agent-ui-slice.js";
import { filesExtractQueryOptions } from "../queries.js";
import { FilePreviewBlock } from "./files-file-preview.js";

/* ── Helpers ── */

function getMimeLabel(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WebP",
    "image/gif": "GIF",
    "text/plain": "Text",
    "text/markdown": "Markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "Word (DOCX)",
    "application/msword": "Word (DOC)",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "PowerPoint",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "Excel",
  };
  return map[mime] ?? mime.split("/").pop()?.toUpperCase() ?? "File";
}

/**
 * Breadcrumbs: files root (link) + each path segment after `tenants/<id>/`,
 * ending with the filename. Intermediate folders are label-only (no list route per prefix).
 */
function filesDetailBreadcrumbsFromKey(
  fileKey: string,
  filesTitle: string
): PageBreadcrumb[] {
  const rest = pathSegmentsAfterFileStorageTenantRoot(fileKey);
  const crumbs: PageBreadcrumb[] = [{ label: filesTitle, to: "/admin/files" }];

  if (rest.length === 0) {
    crumbs.push({ label: fileKey });
    return crumbs;
  }

  if (rest.length === 1) {
    crumbs.push({ label: rest[0]! });
    return crumbs;
  }

  const filename = rest.at(-1)!;
  for (const seg of rest.slice(0, -1)) {
    crumbs.push({ label: seg });
  }
  crumbs.push({ label: filename });
  return crumbs;
}

/* ── Detail Page ── */

export function FilesDetailPage() {
  const { t } = useTranslation("files");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ key: string }>();
  const fileKey = decodeURIComponent(params.key ?? "");
  const filename = fileKey.split("/").pop() ?? fileKey;

  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [mainTab, setMainTab] = useState<"preview" | "extracted">("preview");
  const [extractDisplay, setExtractDisplay] = useState<"rendered" | "raw">(
    "rendered"
  );
  const [extractError, setExtractError] = useState<string | null>(null);

  const mimeType = useMemo(
    () => guessFileStorageMimeFromFilename(filename),
    [filename]
  );

  const kbSlug = useMemo(
    () => knowledgeBaseSlugFromFileStorageKey(fileKey),
    [fileKey]
  );

  const breadcrumbs = useMemo(
    () => filesDetailBreadcrumbsFromKey(fileKey, t("title")),
    [fileKey, t]
  );

  usePageConfig({
    breadcrumbs,
  });

  useFilesDetailAgentUiSlice({ fileKey, filename });

  useEffect(() => {
    setExtractDisplay("rendered");
  }, [fileKey]);

  useEffect(() => {
    if (!fileKey) {
      return;
    }
    setLoading(true);
    setError(null);
    getFilesUrl(fileKey)
      .then((result) => setUrl(result.url))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load file")
      )
      .finally(() => setLoading(false));
  }, [fileKey]);

  const extractQuery = useQuery({
    ...filesExtractQueryOptions(fileKey),
    enabled: Boolean(fileKey) && mainTab === "extracted",
  });

  const extractMutation = useMutation({
    mutationFn: () => postFilesExtract(fileKey),
    onSuccess: async () => {
      setExtractError(null);
      await queryClient.invalidateQueries({
        queryKey: ["files", "extract"],
      });
      setMainTab("extracted");
    },
    onError: (err: unknown) => {
      setExtractError(
        err instanceof Error ? err.message : String(err ?? "Extract failed")
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFile(fileKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", "list"] });
      navigate("/admin/files");
    },
  });

  const handleDownload = useCallback(async () => {
    if (!url) {
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.click();
  }, [url, filename]);

  if (loading) {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_300px]">
        <Skeleton className="h-[600px] w-full rounded-lg" />
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => navigate("/admin/files")}
          size="sm"
          variant="ghost"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {t("title")}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            disabled={!url || extractMutation.isPending}
            onClick={() => {
              setExtractError(null);
              extractMutation.mutate();
            }}
            size="sm"
            variant="secondary"
          >
            {extractMutation.isPending ? (
              <AnimatedLoaderIcon className="mr-1.5" play="always" size="sm" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {t("actions.extractContent")}
          </Button>
          <Button
            disabled={!url}
            onClick={handleDownload}
            size="sm"
            variant="outline"
          >
            <AnimatedDownloadIcon className="mr-1.5" size="sm" />
            {t("actions.download")}
          </Button>
          <Button
            onClick={() => setShowDelete(true)}
            size="sm"
            variant="destructive"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {t("actions.delete")}
          </Button>
        </div>
      </div>

      {/* ── Content: Tabs + Metadata ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="min-h-[500px]">
          <Tabs
            className="flex w-full flex-col gap-3"
            onValueChange={(v) => {
              setMainTab(v === "extracted" ? "extracted" : "preview");
            }}
            value={mainTab}
          >
            <TabsList className="w-fit">
              <TabsTrigger value="preview">{t("tabs.preview")}</TabsTrigger>
              <TabsTrigger value="extracted">{t("tabs.extracted")}</TabsTrigger>
            </TabsList>
            <TabsContent className="mt-0" value="preview">
              {error ? (
                <div className="ui-canvas-panel flex h-full items-center justify-center rounded-lg border-0 bg-destructive/5 p-4">
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              ) : url ? (
                <FilePreviewBlock
                  fileKey={fileKey}
                  filename={filename}
                  generatingLabel={t("preview.generating")}
                  loadingLabel={t("preview.loading")}
                  mimeType={mimeType}
                  noPreviewLabel={t("preview.noPreview")}
                  truncatedLabel={t("preview.truncated")}
                  url={url}
                />
              ) : null}
            </TabsContent>
            <TabsContent className="mt-0" value="extracted">
              {extractError ? (
                <div className="ui-canvas-panel rounded-lg border-0 bg-destructive/5 p-4 text-destructive text-sm">
                  {extractError}
                </div>
              ) : null}
              {extractQuery.isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <AnimatedLoaderIcon play="always" size="sm" />
                  {t("extract.loading")}
                </div>
              ) : extractQuery.data?.markdown ? (
                <div className="ui-canvas-panel relative rounded-lg border-0 bg-card">
                  <div className="pointer-events-none absolute top-1.5 right-1.5 z-10 sm:top-2 sm:right-2">
                    <div
                      aria-label={t("tabs.extracted")}
                      className="pointer-events-auto inline-flex rounded-md border border-border/80 bg-background/90 p-px shadow-sm backdrop-blur-sm"
                      role="group"
                    >
                      <Button
                        className="h-6 min-h-6 rounded-[0.2rem] px-1.5 font-medium text-[11px] leading-none"
                        onClick={() => setExtractDisplay("rendered")}
                        size="sm"
                        type="button"
                        variant={
                          extractDisplay === "rendered" ? "secondary" : "ghost"
                        }
                      >
                        {t("extract.rendered")}
                      </Button>
                      <Button
                        className="h-6 min-h-6 rounded-[0.2rem] px-1.5 font-medium text-[11px] leading-none"
                        onClick={() => setExtractDisplay("raw")}
                        size="sm"
                        type="button"
                        variant={
                          extractDisplay === "raw" ? "secondary" : "ghost"
                        }
                      >
                        {t("extract.raw")}
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-[min(70vh,800px)] overflow-y-auto overscroll-contain p-3 pt-9 pr-3 pb-3 pl-3 sm:pt-10 sm:pr-3.5">
                    {extractDisplay === "rendered" ? (
                      <MessageResponse className="prose prose-sm dark:prose-invert max-w-none">
                        {extractQuery.data.markdown}
                      </MessageResponse>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                        {extractQuery.data.markdown}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                  <p>{t("extract.empty")}</p>
                  <Button
                    className="mt-3"
                    disabled={extractMutation.isPending}
                    onClick={() => {
                      setExtractError(null);
                      extractMutation.mutate();
                    }}
                    size="sm"
                    variant="default"
                  >
                    {extractMutation.isPending ? (
                      <AnimatedLoaderIcon
                        className="mr-1.5"
                        play="always"
                        size="sm"
                      />
                    ) : (
                      <Sparkles className="mr-1.5 h-4 w-4" />
                    )}
                    {t("actions.extractContent")}
                  </Button>
                </div>
              )}
              {extractQuery.data?.extracted_at ? (
                <p className="mt-2 text-muted-foreground text-xs">
                  {t("extract.lastRun", {
                    time: new Date(
                      extractQuery.data.extracted_at
                    ).toLocaleString(),
                  })}
                </p>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-medium text-sm">{t("detail")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">
                {t("columns.filename")}
              </span>
              <p className="mt-0.5 break-all font-medium">{filename}</p>
            </div>
            {kbSlug ? (
              <div>
                <span className="text-muted-foreground">
                  {t("metadata.knowledgeBase")}
                </span>
                <p className="mt-0.5">
                  <Badge variant="outline">{kbSlug}</Badge>
                </p>
              </div>
            ) : null}
            <div>
              <span className="text-muted-foreground">
                {t("metadata.type")}
              </span>
              <p className="mt-0.5">
                <Badge variant="secondary">{getMimeLabel(mimeType)}</Badge>
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t("metadata.path")}
              </span>
              <p className="mt-0.5 break-all font-mono text-xs">{fileKey}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog onOpenChange={setShowDelete} open={showDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("actions.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("actions.confirmDeleteMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
