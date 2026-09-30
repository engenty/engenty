import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery } from "@engenty/query-client";
import {
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Check, ImageIcon, Search, Sparkles, Upload } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  COVER_IMAGE_ACCEPT,
  type Cover,
  isHttpImageUrl,
  MAX_COVER_IMAGE_BYTES,
} from "../cover.js";
import {
  type CoverThemeColorSection,
  coverMatchesPresetValue,
  coverThemeColorPresetSections,
  coverThemeGradientPresets,
} from "../presets.js";
import type { CoverMediaAdapter } from "./cover-media-adapter.js";

/**
 * The cover picker: colours, gradients and — when the owner's adapter offers
 * them — an uploaded image, Unsplash and AI generation. The owning module says
 * where images go (its adapter); the picker only says what the cover becomes.
 */
export function CoverDialog({
  open,
  onOpenChange,
  media,
  currentCover,
  onApplyCover,
  pending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  media: CoverMediaAdapter;
  currentCover: Cover | null | undefined;
  onApplyCover: (cover: Cover) => void;
  pending: boolean;
}) {
  const { t } = useTranslation("common");
  const fileInputId = useId();
  const aiRefInputId = useId();
  const dropRef = useRef<HTMLDivElement>(null);
  const aiRefFileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [highlightDrop, setHighlightDrop] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [colorSections, setColorSections] = useState<CoverThemeColorSection[]>(
    () =>
      typeof document === "undefined" ? [] : coverThemeColorPresetSections()
  );
  const [gradientPresets, setGradientPresets] = useState(() =>
    typeof document === "undefined" ? [] : coverThemeGradientPresets()
  );

  const [mainTab, setMainTab] = useState("color");
  const [imageSubTab, setImageSubTab] = useState("upload");
  const [unsplashInput, setUnsplashInput] = useState("");
  const [unsplashSearchQ, setUnsplashSearchQ] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState<"generate" | "edit">("generate");
  const [useCurrentCoverAsRef, setUseCurrentCoverAsRef] = useState(false);
  const [aiRefUploading, setAiRefUploading] = useState(false);
  const [aiReferenceObjectKey, setAiReferenceObjectKey] = useState<
    string | null
  >(null);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    setColorSections(coverThemeColorPresetSections());
    setGradientPresets(coverThemeGradientPresets());
  }, [open]);

  useEffect(() => {
    if (!open) {
      setImageUrl("");
      setUnsplashInput("");
      setUnsplashSearchQ(null);
      setAiPrompt("");
      setAiMode("generate");
      setUseCurrentCoverAsRef(false);
      setAiReferenceObjectKey(null);
      setMainTab("color");
      setImageSubTab("upload");
    }
  }, [open]);

  const allColorPresets = useMemo(
    () => colorSections.flatMap((s) => s.presets),
    [colorSections]
  );

  const matchedColorPresetValue = useMemo(() => {
    if (currentCover?.type !== "color" || allColorPresets.length === 0) {
      return null;
    }
    const hit = allColorPresets.find((p) =>
      coverMatchesPresetValue(currentCover, "color", p.value)
    );
    return hit?.value ?? null;
  }, [allColorPresets, currentCover]);

  const matchedGradientPresetValue = useMemo(() => {
    if (currentCover?.type !== "gradient" || gradientPresets.length === 0) {
      return null;
    }
    const hit = gradientPresets.find((p) =>
      coverMatchesPresetValue(currentCover, "gradient", p.value)
    );
    return hit?.value ?? null;
  }, [currentCover, gradientPresets]);

  const currentStorageImageKey = useMemo(() => {
    if (currentCover?.type !== "image") {
      return;
    }
    const v = currentCover.value.trim();
    if (!v || isHttpImageUrl(v)) {
      return;
    }
    return v;
  }, [currentCover]);

  const unsplashQuery = useQuery({
    queryKey: ["coverUnsplashSearch", unsplashSearchQ],
    queryFn: () => media.unsplash!.search(unsplashSearchQ!),
    enabled: Boolean(
      media.unsplash && unsplashSearchQ && unsplashSearchQ.length > 0
    ),
  });

  const importUnsplashMutation = useMutation({
    mutationFn: (photoId: string) => media.unsplash!.importPhoto(photoId),
    onSuccess: (cover) => {
      onApplyCover(cover);
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(
        e instanceof Error
          ? e.message
          : t("covers.cover_unsplash_import_failed")
      );
    },
  });

  const aiMutation = useMutation({
    mutationFn: () =>
      media.ai!({
        prompt: aiPrompt.trim(),
        mode: aiMode,
        reference_object_key:
          aiMode === "edit"
            ? (aiReferenceObjectKey ??
              (useCurrentCoverAsRef ? currentStorageImageKey : undefined))
            : undefined,
      }),
    onSuccess: (cover) => {
      onApplyCover(cover);
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : t("covers.cover_ai_failed"));
    },
  });

  const applyUploadedImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error(t("covers.cover_picker_upload_not_image"));
        return;
      }
      if (file.size > MAX_COVER_IMAGE_BYTES) {
        toast.error(t("covers.cover_picker_upload_too_large"));
        return;
      }
      setUploading(true);
      try {
        const key = await media.upload!(file);
        onApplyCover({ type: "image", value: key });
        onOpenChange(false);
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : t("covers.cover_picker_upload_failed")
        );
      } finally {
        setUploading(false);
      }
    },
    [media, onApplyCover, onOpenChange, t]
  );

  const onAiRefFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(t("covers.cover_picker_upload_not_image"));
        return;
      }
      if (file.size > MAX_COVER_IMAGE_BYTES) {
        toast.error(t("covers.cover_picker_upload_too_large"));
        return;
      }
      setAiRefUploading(true);
      try {
        const key = await media.upload!(file);
        setAiReferenceObjectKey(key);
        setUseCurrentCoverAsRef(false);
        toast.success(t("covers.cover_ai_ref_ready"));
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : t("covers.cover_picker_upload_failed")
        );
      } finally {
        setAiRefUploading(false);
      }
    },
    [media, t]
  );

  const runUnsplashSearch = () => {
    const q = unsplashInput.trim();
    if (q.length < 1) {
      toast.error(t("covers.cover_unsplash_query_required"));
      return;
    }
    setUnsplashSearchQ(q);
  };

  const editReferenceKey =
    aiMode === "edit"
      ? (aiReferenceObjectKey ??
        (useCurrentCoverAsRef ? currentStorageImageKey : undefined))
      : undefined;

  const canRunAi =
    aiPrompt.trim().length > 0 &&
    (aiMode === "generate" || Boolean(editReferenceKey));

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/* One fixed height for every tab: switching Farbe / Verlauf / Bild
          (and the image sub-tabs) must not resize the dialog. The body
          scrolls inside it instead. */}
      <DialogContent className="flex h-[min(90vh,560px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-border-soft border-b px-4 py-3 text-left">
          <DialogTitle className="text-base">
            {t("covers.cover_dialog_title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("covers.cover_dialog_description")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <Tabs onValueChange={setMainTab} value={mainTab}>
            <TabsList className="grid h-9 w-full min-w-0 grid-cols-3 gap-0.5 p-1">
              <TabsTrigger className="text-xs" value="color">
                {t("covers.cover_picker_color_tab")}
              </TabsTrigger>
              <TabsTrigger className="text-xs" value="gradient">
                {t("covers.cover_picker_gradient_tab")}
              </TabsTrigger>
              <TabsTrigger className="text-xs" value="image">
                {t("covers.cover_picker_image_tab")}
              </TabsTrigger>
            </TabsList>

            <TabsContent className="mt-3 space-y-3" value="color">
              {colorSections.map((section) => (
                <div className="space-y-1.5" key={section.tone}>
                  <div className="px-0.5 text-muted-foreground text-xxs uppercase tracking-wide">
                    {section.tone === "light"
                      ? t("covers.cover_picker_tone_light")
                      : t("covers.cover_picker_tone_vibrant")}
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {section.presets.map((p) => {
                      const selected = matchedColorPresetValue === p.value;
                      return (
                        <button
                          aria-label={p.label}
                          aria-pressed={selected ? "true" : "false"}
                          className={cn(
                            "relative size-8 rounded-md border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected
                              ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                              : "border-border-soft"
                          )}
                          key={p.value}
                          onClick={() => {
                            onApplyCover({ type: "color", value: p.value });
                            onOpenChange(false);
                          }}
                          style={{ background: p.value }}
                          title={p.label}
                          type="button"
                        >
                          {selected ? (
                            <span className="pointer-events-none absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-card text-primary shadow-sm ring-1 ring-border">
                              <Check
                                aria-hidden
                                className="size-2.5"
                                strokeWidth={3}
                              />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent className="mt-3" value="gradient">
              <div className="grid grid-cols-4 gap-1.5">
                {gradientPresets.map((p) => {
                  const selected = matchedGradientPresetValue === p.value;
                  return (
                    <button
                      aria-label={p.label}
                      aria-pressed={selected ? "true" : "false"}
                      className={cn(
                        "relative h-10 w-full rounded-md border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : "border-border-soft"
                      )}
                      key={p.value}
                      onClick={() => {
                        onApplyCover({ type: "gradient", value: p.value });
                        onOpenChange(false);
                      }}
                      style={{ background: p.value }}
                      title={p.label}
                      type="button"
                    >
                      {selected ? (
                        <span className="pointer-events-none absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-card text-primary shadow-sm ring-1 ring-border">
                          <Check
                            aria-hidden
                            className="size-2.5"
                            strokeWidth={3}
                          />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent className="mt-3 space-y-3" value="image">
              <Tabs onValueChange={setImageSubTab} value={imageSubTab}>
                {media.unsplash || media.ai ? (
                  <TabsList
                    className="grid h-8 w-full gap-0.5 p-0.5"
                    style={{
                      gridTemplateColumns: `repeat(${
                        1 + (media.unsplash ? 1 : 0) + (media.ai ? 1 : 0)
                      }, minmax(0, 1fr))`,
                    }}
                  >
                    <TabsTrigger className="text-[11px]" value="upload">
                      {t("covers.cover_image_sub_upload")}
                    </TabsTrigger>
                    {media.unsplash ? (
                      <TabsTrigger className="text-[11px]" value="unsplash">
                        Unsplash
                      </TabsTrigger>
                    ) : null}
                    {media.ai ? (
                      <TabsTrigger className="text-[11px]" value="ai">
                        {t("covers.cover_image_sub_ai")}
                      </TabsTrigger>
                    ) : null}
                  </TabsList>
                ) : null}

                <TabsContent className="mt-3 space-y-3" value="upload">
                  {media.upload ? (
                    <>
                      <input
                        accept={COVER_IMAGE_ACCEPT}
                        className="sr-only"
                        id={fileInputId}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) {
                            void applyUploadedImage(file);
                          }
                        }}
                        ref={fileRef}
                        type="file"
                      />
                      <div
                        className={cn(
                          "flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-6 transition-colors",
                          highlightDrop
                            ? "border-primary bg-primary/5"
                            : "border-border-soft bg-muted/20 hover:bg-muted/35"
                        )}
                        onClick={() => fileRef.current?.click()}
                        onDragLeave={() => setHighlightDrop(false)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setHighlightDrop(true);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setHighlightDrop(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            void applyUploadedImage(file);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            fileRef.current?.click();
                          }
                        }}
                        ref={dropRef}
                        role="button"
                        tabIndex={0}
                      >
                        <Upload
                          aria-hidden
                          className="size-6 text-muted-foreground"
                        />
                        <span className="text-center text-muted-foreground text-xs">
                          {t("covers.cover_upload_drop_hint")}
                        </span>
                        <Button
                          className="pointer-events-none gap-2"
                          disabled={uploading}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {uploading ? (
                            <AnimatedLoaderIcon play="always" size="xs" />
                          ) : (
                            <ImageIcon className="size-3.5" />
                          )}
                          {uploading
                            ? t("covers.cover_picker_uploading")
                            : t("covers.cover_picker_upload_button")}
                        </Button>
                      </div>

                      <div className="relative">
                        <div
                          aria-hidden
                          className="absolute inset-x-0 top-1/2 h-px bg-border/60"
                        />
                        <span className="relative mx-auto block w-fit bg-card px-2 text-muted-foreground text-xxs uppercase tracking-wide">
                          {t("covers.cover_picker_image_or_url")}
                        </span>
                      </div>
                    </>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <Input
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder={t("covers.cover_picker_image_placeholder")}
                      value={imageUrl}
                    />
                    <Button
                      disabled={!imageUrl.trim()}
                      onClick={() => {
                        const trimmed = imageUrl.trim();
                        if (!trimmed) {
                          return;
                        }
                        if (!isHttpImageUrl(trimmed)) {
                          toast.error(
                            t("covers.cover_picker_image_url_invalid")
                          );
                          return;
                        }
                        onApplyCover({ type: "image", value: trimmed });
                        onOpenChange(false);
                      }}
                      size="sm"
                      type="button"
                      variant="default"
                    >
                      {t("covers.cover_picker_apply")}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent className="mt-3 space-y-3" value="unsplash">
                  <div className="flex gap-2">
                    <Input
                      className="min-w-0 flex-1"
                      onChange={(e) => setUnsplashInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          runUnsplashSearch();
                        }
                      }}
                      placeholder={t("covers.cover_unsplash_placeholder")}
                      value={unsplashInput}
                    />
                    <Button
                      className="shrink-0 gap-1.5"
                      disabled={unsplashQuery.isFetching}
                      onClick={runUnsplashSearch}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {unsplashQuery.isFetching ? (
                        <AnimatedLoaderIcon play="always" size="xs" />
                      ) : (
                        <Search className="size-3.5" />
                      )}
                      {t("covers.cover_unsplash_search")}
                    </Button>
                  </div>
                  {unsplashQuery.isError ? (
                    <p className="text-destructive text-xs">
                      {t("covers.cover_unsplash_error")}
                    </p>
                  ) : null}
                  <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
                    {(unsplashQuery.data?.photos ?? []).map((p) => (
                      <button
                        className="group relative aspect-square overflow-hidden rounded-md border border-border-soft bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={importUnsplashMutation.isPending}
                        key={p.id}
                        onClick={() => importUnsplashMutation.mutate(p.id)}
                        type="button"
                      >
                        <img
                          alt=""
                          className="size-full object-cover transition-transform group-hover:scale-105"
                          height={120}
                          src={p.urls.small || p.urls.thumb}
                          width={120}
                        />
                        {importUnsplashMutation.isPending &&
                        importUnsplashMutation.variables === p.id ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                            <AnimatedLoaderIcon
                              className="text-primary"
                              play="always"
                              size="md"
                            />
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xxs leading-snug">
                    <a
                      className="underline underline-offset-2"
                      href="https://unsplash.com"
                      rel="noreferrer"
                      target="_blank"
                    >
                      Unsplash
                    </a>
                    {` — ${t("covers.cover_unsplash_terms")}`}
                  </p>
                </TabsContent>

                <TabsContent className="mt-3 space-y-3" value="ai">
                  <Tabs
                    onValueChange={(v) => {
                      setAiMode(v as "generate" | "edit");
                      setAiReferenceObjectKey(null);
                      setUseCurrentCoverAsRef(false);
                    }}
                    value={aiMode}
                  >
                    <TabsList className="grid h-8 w-full grid-cols-2 gap-0.5 p-0.5">
                      <TabsTrigger className="text-xs" value="generate">
                        {t("covers.cover_ai_mode_generate")}
                      </TabsTrigger>
                      <TabsTrigger className="text-xs" value="edit">
                        {t("covers.cover_ai_mode_edit")}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {aiMode === "edit" ? (
                    <div className="space-y-2 rounded-md border border-border-soft bg-muted/15 p-2.5">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={useCurrentCoverAsRef}
                          className="mt-0.5"
                          disabled={
                            !currentStorageImageKey ||
                            Boolean(aiReferenceObjectKey)
                          }
                          id="cover-ai-use-current"
                          onCheckedChange={(c) => {
                            setUseCurrentCoverAsRef(c === true);
                            if (c === true) {
                              setAiReferenceObjectKey(null);
                            }
                          }}
                        />
                        <Label
                          className="cursor-pointer text-xs leading-snug"
                          htmlFor="cover-ai-use-current"
                        >
                          {t("covers.cover_ai_use_current")}
                        </Label>
                      </div>
                      {currentStorageImageKey ? null : (
                        <p className="text-muted-foreground text-xxs">
                          {t("covers.cover_ai_use_current_hint")}
                        </p>
                      )}
                      {media.upload ? (
                        <div className="space-y-1">
                          <Label className="text-muted-foreground text-xxs">
                            {t("covers.cover_ai_ref_upload")}
                          </Label>
                          <input
                            accept={COVER_IMAGE_ACCEPT}
                            className="sr-only"
                            id={aiRefInputId}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) {
                                void onAiRefFile(f);
                              }
                            }}
                            ref={aiRefFileRef}
                            type="file"
                          />
                          <Button
                            className="w-full gap-2"
                            disabled={aiRefUploading}
                            onClick={() => aiRefFileRef.current?.click()}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {aiRefUploading ? (
                              <AnimatedLoaderIcon play="always" size="xs" />
                            ) : null}
                            {t("covers.cover_ai_ref_upload_button")}
                          </Button>
                          {aiReferenceObjectKey ? (
                            <p className="text-muted-foreground text-xxs">
                              {t("covers.cover_ai_ref_ready")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label
                      className="text-muted-foreground text-xs"
                      htmlFor="cover-ai-prompt"
                    >
                      {t("covers.cover_ai_prompt_label")}
                    </Label>
                    <Textarea
                      className="min-h-[88px] resize-y text-sm"
                      id="cover-ai-prompt"
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder={t("covers.cover_ai_prompt_placeholder")}
                      value={aiPrompt}
                    />
                  </div>

                  <Button
                    className="w-full gap-2"
                    disabled={!canRunAi || aiMutation.isPending || pending}
                    onClick={() => aiMutation.mutate()}
                    size="sm"
                    type="button"
                    variant="default"
                  >
                    {aiMutation.isPending ? (
                      <AnimatedLoaderIcon play="always" size="xs" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {t("covers.cover_ai_run")}
                  </Button>
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </div>

        {currentCover?.type === "image" &&
        currentCover.source?.kind === "unsplash" ? (
          <div className="border-border-soft border-t px-4 py-2 text-muted-foreground text-xxs">
            {t("covers.cover_attribution_photo_by")}{" "}
            <a
              className="text-foreground underline underline-offset-2"
              href={currentCover.source.photographer_url}
              rel="noreferrer"
              target="_blank"
            >
              {currentCover.source.photographer_name}
            </a>
            {` (${t("covers.cover_attribution_on")} `}
            <a
              className="text-foreground underline underline-offset-2"
              href="https://unsplash.com"
              rel="noreferrer"
              target="_blank"
            >
              Unsplash
            </a>
            )
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
