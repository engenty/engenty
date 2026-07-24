import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  FileInput,
  FormItem,
  FormLabel,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Sparkles, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { getTeamFileStorageSignedUrl } from "../lib/team-file-storage-url.js";
import {
  TEAM_MEMBER_PHOTO_ACCEPT,
  uploadTeamMemberPhotoViaVault,
} from "../lib/team-vault-upload.js";
import { TeamAvatarAiCreatorModal } from "./team-avatar-ai-creator-modal.js";

export function TeamMemberProfileImageField(props: {
  fullName: string;
  initials: string | null;
  profileId: string;
  storageKey: string | null;
  disabled?: boolean;
  onChange: (storageKey: string | null) => Promise<void> | void;
}) {
  const { t } = useTranslation("team");
  const { currentTenant } = useWorkspaceContext();
  const tenantId = currentTenant?.id ?? null;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const imageUrlQuery = useQuery({
    queryKey: ["team", "profile-image-url", props.storageKey],
    queryFn: () => getTeamFileStorageSignedUrl(props.storageKey!),
    enabled: Boolean(props.storageKey),
    staleTime: 45 * 60 * 1000,
  });

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!(file && tenantId)) {
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const uploaded = await uploadTeamMemberPhotoViaVault(file, {
          tenantId,
          profileId: props.profileId,
          kind: "profile",
        });
        await props.onChange(uploaded.key);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : t("profileImageUploadFailed")
        );
        throw err;
      } finally {
        setUploading(false);
      }
    },
    [props.onChange, props.profileId, tenantId, t]
  );

  const handleRemove = useCallback(async () => {
    setError(null);
    try {
      await props.onChange(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : t("profileImageRemoveFailed")
      );
      throw err;
    }
  }, [props.onChange, t]);

  const fallback =
    props.initials?.trim() || props.fullName.slice(0, 2).toUpperCase();

  return (
    <FormItem variant="row">
      <FormLabel>{t("profilePicture")}</FormLabel>
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <button
            aria-label={t("profilePicture")}
            className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={props.disabled || uploading || !tenantId}
            onClick={() => setAiModalOpen(true)}
            type="button"
          >
            <Avatar className="h-16 w-16">
              {props.storageKey && imageUrlQuery.data ? (
                <AvatarImage alt={props.fullName} src={imageUrlQuery.data} />
              ) : null}
              <AvatarFallback className="bg-muted text-lg text-muted-foreground">
                {fallback}
              </AvatarFallback>
            </Avatar>
            <span className="pointer-events-none absolute inset-0 rounded-full bg-black/0 transition-colors group-hover:bg-black/25" />
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="border-ember/40 bg-ember/10 text-ember hover:bg-ember/20"
              disabled={props.disabled || uploading || !tenantId}
              onClick={() => setAiModalOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-ember" />
              Camera / AI Avatar
            </Button>

            <FileInput
              accept={TEAM_MEMBER_PHOTO_ACCEPT}
              aria-label={t("uploadProfilePicture")}
              disabled={props.disabled || uploading || !tenantId}
              emptyLabel={t("noFileSelected")}
              onFileChange={(file) => void handleFile(file)}
              selectLabel={
                props.storageKey
                  ? t("replaceProfilePicture")
                  : t("uploadProfilePicture")
              }
            />
            {uploading ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
                <AnimatedLoaderIcon play="always" size="xs" />
                {t("uploading")}
              </span>
            ) : null}
            <Button
              disabled={props.disabled || uploading || !props.storageKey}
              onClick={() => void handleRemove()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("removeProfilePicture")}
            </Button>
          </div>
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          {t("profilePictureHint")}
        </p>
      </div>

      <TeamAvatarAiCreatorModal
        hasExistingAvatar={Boolean(props.storageKey)}
        initialName={props.fullName}
        onAvatarGenerated={handleFile}
        onDeleteAvatar={handleRemove}
        onOpenChange={setAiModalOpen}
        open={aiModalOpen}
      />
    </FormItem>
  );
}

export function TeamMemberProfileImageDisplay(props: {
  fullName: string;
  initials: string | null;
  storageKey: string | null;
}) {
  const imageUrlQuery = useQuery({
    queryKey: ["team", "profile-image-url", props.storageKey],
    queryFn: () => getTeamFileStorageSignedUrl(props.storageKey!),
    enabled: Boolean(props.storageKey),
    staleTime: 45 * 60 * 1000,
  });

  const fallback =
    props.initials?.trim() || props.fullName.slice(0, 2).toUpperCase();

  return (
    <Avatar className="h-16 w-16">
      {props.storageKey && imageUrlQuery.data ? (
        <AvatarImage alt={props.fullName} src={imageUrlQuery.data} />
      ) : null}
      <AvatarFallback className="bg-muted text-lg text-muted-foreground">
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}
