import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import {
  Camera,
  Check,
  ImageIcon,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  User,
  VideoOff,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { stripHabboLightBackground } from "../lib/habbo-bg-strip.js";
import {
  analyzePhotoForAvatar,
  type HabboAvatarOptions,
} from "../lib/habbo-pixel-generator.js";

interface TeamAvatarAiCreatorModalProps {
  /** When true, show a delete action for the current profile picture. */
  hasExistingAvatar?: boolean;
  initialName?: string;
  onAvatarGenerated: (file: File) => Promise<void> | void;
  /** Clears the member profile picture (storage key → null). */
  onDeleteAvatar?: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface AvatarVariation {
  dataUrl: string;
  id: number;
  label: string;
  options: HabboAvatarOptions;
}

const VARIATION_LABELS = ["Casual Habbo", "Executive Suit", "Cyber Copilot"];

async function dataUrlToFile(
  dataUrl: string,
  filename: string,
  mime = "image/png"
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: mime });
}

/** Shrink camera/upload data URLs before POSTing to the Habbo API. */
async function compressReferenceDataUrl(
  dataUrl: string,
  maxEdge = 512,
  quality = 0.85
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to load reference photo"));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return dataUrl;
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function TeamAvatarAiCreatorModal({
  open,
  onOpenChange,
  onAvatarGenerated,
  onDeleteAvatar,
  hasExistingAvatar = false,
  initialName = "Team Member",
}: TeamAvatarAiCreatorModalProps) {
  const { t } = useTranslation("team");

  const [activeTab, setActiveTab] = useState<"camera" | "upload" | "ai">(
    "camera"
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);

  const [options, setOptions] = useState<HabboAvatarOptions>({
    skinTone: "medium",
    hairColor: "dark",
    hairStyle: "short",
    outfitStyle: "casual",
    outfitColor: "ember",
    glasses: false,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [variations, setVariations] = useState<AvatarVariation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: unknown) {
      setCameraError(
        err instanceof Error
          ? err.message
          : "Camera access denied or unavailable."
      );
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      for (const track of stream.getTracks()) {
        track.stop();
      }
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (open && activeTab === "camera" && !capturedPhotoUrl) {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, activeTab, capturedPhotoUrl, startCamera, stopCamera]);

  const handleSnapPhoto = useCallback(() => {
    if (!videoRef.current) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const v = videoRef.current;
    const size = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - size) / 2;
    const sy = (v.videoHeight - size) / 2;

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, sx, sy, size, size, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/png");
    setCapturedPhotoUrl(dataUrl);
    stopCamera();

    const analysis = analyzePhotoForAvatar(canvas);
    setOptions((prev) => ({
      ...prev,
      skinTone: analysis.skinTone,
      hairColor: analysis.hairColor,
      outfitColor: analysis.outfitColor,
    }));
  }, [stopCamera]);

  const handleUploadedPhoto = useCallback((file: File | null) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setCapturedPhotoUrl(url);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, 400, 400);
          const analysis = analyzePhotoForAvatar(canvas);
          setOptions((prev) => ({
            ...prev,
            skinTone: analysis.skinTone,
            hairColor: analysis.hairColor,
            outfitColor: analysis.outfitColor,
          }));
        }
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  }, []);

  const generateAvatars = useCallback(async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationStep("Prompting Gemini image model…");
    setActiveTab("ai");

    try {
      setGenerationStep("Synthesizing Habbo isometric sprites…");
      const referenceDataUrl = capturedPhotoUrl
        ? await compressReferenceDataUrl(capturedPhotoUrl)
        : undefined;
      const res = await requestApiJson<{
        ok: true;
        model: string;
        avatars: Array<{
          id: number;
          label: string;
          data_url: string;
          options: HabboAvatarOptions;
        }>;
      }>("/api/team/avatars/habbo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_name: initialName,
          options,
          reference_data_url: referenceDataUrl,
          variation_count: 3,
        }),
      });

      setGenerationStep("Cleaning white edge artefacts…");
      const cleaned: AvatarVariation[] = [];
      for (const [idx, avatar] of res.avatars.entries()) {
        const dataUrl = await stripHabboLightBackground(avatar.data_url, {
          canvasSize: 256,
          pad: 10,
        });
        cleaned.push({
          id: avatar.id,
          dataUrl,
          label: avatar.label || VARIATION_LABELS[idx] || `Variant ${idx + 1}`,
          options: avatar.options,
        });
      }

      setVariations(cleaned);
      setSelectedIndex(0);
    } catch (err: unknown) {
      setGenerationError(
        err instanceof Error ? err.message : "Avatar generation failed."
      );
      setVariations([]);
    } finally {
      setIsGenerating(false);
      setGenerationStep("");
    }
  }, [capturedPhotoUrl, initialName, options]);

  const handleApplyGenerated = useCallback(async () => {
    const selected = variations[selectedIndex];
    if (!selected) {
      return;
    }
    setIsApplying(true);
    setGenerationError(null);
    try {
      const safeName = initialName.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const file = await dataUrlToFile(
        selected.dataUrl,
        `${safeName}_habbo_avatar.png`
      );
      await onAvatarGenerated(file);
      onOpenChange(false);
    } catch (err: unknown) {
      setGenerationError(
        err instanceof Error ? err.message : "Failed to apply avatar."
      );
    } finally {
      setIsApplying(false);
    }
  }, [variations, selectedIndex, initialName, onAvatarGenerated, onOpenChange]);

  const handleUsePhotoAsIs = useCallback(async () => {
    if (!capturedPhotoUrl) {
      return;
    }
    setIsApplying(true);
    setGenerationError(null);
    try {
      const safeName = initialName.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const mime = capturedPhotoUrl.startsWith("data:image/jpeg")
        ? "image/jpeg"
        : "image/png";
      const ext = mime === "image/jpeg" ? "jpg" : "png";
      const file = await dataUrlToFile(
        capturedPhotoUrl,
        `${safeName}_photo.${ext}`,
        mime
      );
      await onAvatarGenerated(file);
      onOpenChange(false);
    } catch (err: unknown) {
      setGenerationError(
        err instanceof Error ? err.message : "Failed to apply photo."
      );
    } finally {
      setIsApplying(false);
    }
  }, [capturedPhotoUrl, initialName, onAvatarGenerated, onOpenChange]);

  const handleDeleteAvatar = useCallback(async () => {
    if (!onDeleteAvatar) {
      return;
    }
    setIsApplying(true);
    setGenerationError(null);
    try {
      await onDeleteAvatar();
      onOpenChange(false);
    } catch (err: unknown) {
      setGenerationError(
        err instanceof Error ? err.message : "Failed to remove avatar."
      );
    } finally {
      setIsApplying(false);
    }
  }, [onDeleteAvatar, onOpenChange]);

  const photoActionButtons = capturedPhotoUrl ? (
    <div className="flex flex-wrap justify-center gap-2">
      <Button
        disabled={isApplying || isGenerating}
        onClick={() => {
          setCapturedPhotoUrl(null);
          if (activeTab === "camera") {
            void startCamera();
          }
        }}
        size="sm"
        variant="outline"
      >
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        {activeTab === "upload" ? "Change Photo" : "Retake Photo"}
      </Button>
      <Button
        disabled={isApplying || isGenerating}
        onClick={() => void handleUsePhotoAsIs()}
        size="sm"
        variant="outline"
      >
        <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
        Use this photo
      </Button>
      <Button
        className="bg-ember text-white hover:bg-ember/90"
        disabled={isApplying || isGenerating}
        onClick={() => void generateAvatars()}
        size="sm"
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        Generate Habbo Avatar
      </Button>
    </div>
  ) : null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Wand2 className="h-5 w-5 text-ember" />
            Create AI Team Avatar (Gemini)
          </DialogTitle>
        </DialogHeader>

        <div className="flex border-b text-sm">
          <button
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-2.5 font-medium transition-colors ${
              activeTab === "camera"
                ? "border-ember text-ember"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("camera")}
            type="button"
          >
            <Camera className="h-4 w-4" />
            Front Camera
          </button>
          <button
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-2.5 font-medium transition-colors ${
              activeTab === "upload"
                ? "border-ember text-ember"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("upload")}
            type="button"
          >
            <Upload className="h-4 w-4" />
            Upload Photo
          </button>
          <button
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-2.5 font-medium transition-colors ${
              activeTab === "ai"
                ? "border-ember text-ember"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("ai")}
            type="button"
          >
            <Sparkles className="h-4 w-4" />
            Gemini Avatars ({variations.length})
          </button>
        </div>

        <div className="py-3">
          {activeTab === "camera" && (
            <div className="space-y-4">
              <div className="relative mx-auto flex h-64 w-64 items-center justify-center overflow-hidden rounded-xl border bg-black shadow-inner">
                {capturedPhotoUrl ? (
                  <img
                    alt="Captured selfie view"
                    className="h-full w-full object-cover"
                    height={256}
                    src={capturedPhotoUrl}
                    width={256}
                  />
                ) : (
                  <>
                    <video
                      autoPlay
                      className="h-full w-full object-cover [transform:scaleX(-1)]"
                      muted
                      playsInline
                      ref={videoRef}
                    />
                    {!cameraActive && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground text-xs">
                        <VideoOff className="h-8 w-8 text-muted-foreground" />
                        {cameraError ?? "Starting camera..."}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-center gap-3">
                {capturedPhotoUrl ? (
                  photoActionButtons
                ) : (
                  <Button
                    className="bg-ember text-white hover:bg-ember/90"
                    disabled={!cameraActive}
                    onClick={handleSnapPhoto}
                    size="sm"
                  >
                    <Camera className="mr-1.5 h-3.5 w-3.5" />
                    Snap Photo
                  </Button>
                )}
              </div>
            </div>
          )}

          {activeTab === "upload" && (
            <div className="space-y-4">
              <div className="mx-auto flex h-64 w-64 flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center">
                {capturedPhotoUrl ? (
                  <img
                    alt="Uploaded selfie preview"
                    className="h-full w-full rounded-lg object-cover"
                    height={256}
                    src={capturedPhotoUrl}
                    width={256}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <User className="h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground text-xs">
                      Select or drag & drop a profile photo
                    </p>
                    <FileInput
                      accept="image/png,image/jpeg,image/webp"
                      onFileChange={handleUploadedPhoto}
                      selectLabel="Choose Photo"
                    />
                  </div>
                )}
              </div>

              {capturedPhotoUrl ? photoActionButtons : null}
            </div>
          )}

          {activeTab === "ai" && (
            <div className="space-y-4">
              {isGenerating ? (
                <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
                  <Sparkles className="h-8 w-8 animate-spin text-ember" />
                  <p className="font-medium text-sm">{generationStep}</p>
                  <p className="text-muted-foreground text-xs">
                    Habbo isometric pixel avatar via Gemini — then strip white
                    edges
                  </p>
                </div>
              ) : (
                <>
                  {generationError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs">
                      {generationError}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted-foreground text-xs">
                      Gemini Habbo avatars (select one)
                    </span>
                    <Button
                      onClick={() => void generateAvatars()}
                      size="xs"
                      variant="outline"
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Regenerate
                    </Button>
                  </div>

                  {variations.length === 0 && !generationError ? (
                    <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
                      <p className="text-muted-foreground text-xs">
                        Generate from options below, or snap / upload a photo
                        first for likeness hints.
                      </p>
                      <Button
                        className="bg-ember text-white hover:bg-ember/90"
                        onClick={() => void generateAvatars()}
                        size="sm"
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        Generate Habbo Avatar
                      </Button>
                    </div>
                  ) : null}

                  {variations.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                      {variations.map((v, idx) => (
                        <button
                          className={`group relative flex flex-col items-center rounded-xl border p-3 transition-all ${
                            selectedIndex === idx
                              ? "border-2 border-ember bg-ember/5 shadow-md"
                              : "bg-card hover:border-muted-foreground/40"
                          }`}
                          key={v.id}
                          onClick={() => setSelectedIndex(idx)}
                          type="button"
                        >
                          {selectedIndex === idx && (
                            <div className="absolute top-2 right-2 rounded-full bg-ember p-0.5 text-white">
                              <Check className="h-3.5 w-3.5" />
                            </div>
                          )}
                          <img
                            alt={v.label}
                            className="h-28 w-28 bg-[repeating-conic-gradient(#f3d0d8_0%_25%,#e8b8c4_0%_50%)] bg-size-[12px_12px] [image-rendering:pixelated]"
                            height={112}
                            src={v.dataUrl}
                            width={112}
                          />
                          <span className="mt-2 font-medium text-xs">
                            {v.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-3 border-t pt-2 text-xs">
                    <div>
                      <label className="mb-1 block font-medium text-muted-foreground">
                        Outfit Color
                      </label>
                      <Select
                        onValueChange={(val) => {
                          setOptions((p) => ({
                            ...p,
                            outfitColor:
                              val as HabboAvatarOptions["outfitColor"],
                          }));
                        }}
                        value={options.outfitColor}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ember">Ember Orange</SelectItem>
                          <SelectItem value="cobalt">Cobalt Blue</SelectItem>
                          <SelectItem value="moss">Moss Green</SelectItem>
                          <SelectItem value="rose">Rose Pink</SelectItem>
                          <SelectItem value="amber">Amber Gold</SelectItem>
                          <SelectItem value="dark">Dark Charcoal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1 block font-medium text-muted-foreground">
                        Hair Color
                      </label>
                      <Select
                        onValueChange={(val) => {
                          setOptions((p) => ({
                            ...p,
                            hairColor: val as HabboAvatarOptions["hairColor"],
                          }));
                        }}
                        value={options.hairColor}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dark">Dark Espresso</SelectItem>
                          <SelectItem value="blonde">Golden Blonde</SelectItem>
                          <SelectItem value="auburn">Auburn</SelectItem>
                          <SelectItem value="silver">Silver</SelectItem>
                          <SelectItem value="ember">Ember Red</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-1 justify-start">
            {hasExistingAvatar && onDeleteAvatar ? (
              <Button
                disabled={isApplying || isGenerating}
                onClick={() => void handleDeleteAvatar()}
                type="button"
                variant="outline"
              >
                <Trash2 className="mr-1.5 h-4 w-4 text-destructive" />
                {t("removeProfilePicture")}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} variant="outline">
              {t("cancel")}
            </Button>
            {activeTab === "ai" && variations.length > 0 && !isGenerating ? (
              <Button
                className="bg-ember text-white hover:bg-ember/90"
                disabled={isApplying}
                onClick={() => void handleApplyGenerated()}
              >
                <Check className="mr-1.5 h-4 w-4" />
                Apply as Profile Picture
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
