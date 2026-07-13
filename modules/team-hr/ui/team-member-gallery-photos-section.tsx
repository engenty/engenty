import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  getTeamFileStorageSignedUrl,
  TEAM_MEMBER_PHOTO_ACCEPT,
  teamMemberKeys,
  uploadTeamMemberPhotoViaVault,
} from "@engenty/team/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileInput,
  Input,
  Label,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import {
  createTeamMemberGalleryPhoto,
  deleteTeamMemberGalleryPhoto,
  type TeamMemberGalleryPhoto,
  updateTeamMemberGalleryPhoto,
} from "./hr-api.js";

function GalleryPhotoThumb(props: { photo: TeamMemberGalleryPhoto }) {
  const urlQuery = useQuery({
    queryKey: ["team", "gallery-photo-url", props.photo.storage_key],
    queryFn: () => getTeamFileStorageSignedUrl(props.photo.storage_key),
    staleTime: 45 * 60 * 1000,
  });

  if (urlQuery.isPending) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-md border bg-muted">
        <AnimatedLoaderIcon
          className="text-muted-foreground"
          play="always"
          size="md"
        />
      </div>
    );
  }

  if (!urlQuery.data) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
        —
      </div>
    );
  }

  return (
    <img
      alt={props.photo.alt_text ?? props.photo.title ?? ""}
      className="aspect-square w-full rounded-md border object-cover"
      height={240}
      src={urlQuery.data}
      width={240}
    />
  );
}

function GalleryPhotoEditDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: TeamMemberGalleryPhoto;
  profileId: string;
}) {
  const { t } = useTranslation("team");
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(props.photo.title ?? "");
  const [altText, setAltText] = useState(props.photo.alt_text ?? "");
  const [copyright, setCopyright] = useState(props.photo.copyright ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      updateTeamMemberGalleryPhoto(props.profileId, props.photo.id, {
        title: title.trim() || null,
        alt_text: altText.trim() || null,
        copyright: copyright.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teamMemberKeys.detailPage(props.profileId),
      });
      props.onOpenChange(false);
    },
  });

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editGalleryPhoto")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <GalleryPhotoThumb photo={props.photo} />
          <div className="space-y-1.5">
            <Label htmlFor="gallery-title">{t("photoTitle")}</Label>
            <Input
              id="gallery-title"
              onChange={(e) => setTitle(e.target.value)}
              value={title}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gallery-alt">{t("photoAltText")}</Label>
            <Input
              id="gallery-alt"
              onChange={(e) => setAltText(e.target.value)}
              value={altText}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gallery-copyright">{t("photoCopyright")}</Label>
            <Input
              id="gallery-copyright"
              onChange={(e) => setCopyright(e.target.value)}
              placeholder={t("photoCopyrightPlaceholder")}
              value={copyright}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            type="button"
          >
            {saveMutation.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamMemberGalleryPhotosEditor(props: {
  profileId: string;
  photos: TeamMemberGalleryPhoto[];
}) {
  const { t } = useTranslation("team");
  const { currentTenant } = useWorkspaceContext();
  const tenantId = currentTenant?.id ?? null;
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPhoto, setEditingPhoto] =
    useState<TeamMemberGalleryPhoto | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) =>
      deleteTeamMemberGalleryPhoto(props.profileId, photoId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teamMemberKeys.detailPage(props.profileId),
      });
    },
  });

  const handleUpload = useCallback(
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
          kind: "gallery",
        });
        await createTeamMemberGalleryPhoto(props.profileId, {
          storage_key: uploaded.key,
          sort_order: props.photos.length,
        });
        await queryClient.invalidateQueries({
          queryKey: teamMemberKeys.detailPage(props.profileId),
        });
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : t("galleryPhotoUploadFailed")
        );
      } finally {
        setUploading(false);
      }
    },
    [props.photos.length, props.profileId, queryClient, tenantId, t]
  );

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div>
        <h3 className="font-medium text-sm">{t("employeePhotos")}</h3>
        <p className="text-muted-foreground text-xs">
          {t("employeePhotosHint")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FileInput
          accept={TEAM_MEMBER_PHOTO_ACCEPT}
          aria-label={t("addGalleryPhoto")}
          disabled={uploading || !tenantId}
          emptyLabel={t("noFileSelected")}
          onFileChange={handleUpload}
          selectLabel={t("addGalleryPhoto")}
        />
        {uploading ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
            <AnimatedLoaderIcon play="always" size="xs" />
            {t("uploading")}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {props.photos.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {props.photos.map((photo) => (
            <li className="space-y-2 rounded-md border p-2" key={photo.id}>
              <GalleryPhotoThumb photo={photo} />
              <div className="space-y-0.5 text-sm">
                <p className="font-medium">
                  {photo.title || t("untitledPhoto")}
                </p>
                {photo.copyright ? (
                  <p className="text-muted-foreground text-xs">
                    {t("photoCopyright")}: {photo.copyright}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setEditingPhoto(photo)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  {t("edit")}
                </Button>
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(photo.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {t("remove")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("noGalleryPhotos")}</p>
      )}
      {editingPhoto ? (
        <GalleryPhotoEditDialog
          onOpenChange={(open) => {
            if (!open) {
              setEditingPhoto(null);
            }
          }}
          open
          photo={editingPhoto}
          profileId={props.profileId}
        />
      ) : null}
    </div>
  );
}

export function TeamMemberGalleryPhotosDisplay(props: {
  photos: TeamMemberGalleryPhoto[];
}) {
  const { t } = useTranslation("team");

  if (props.photos.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <h3 className="font-medium text-sm">{t("employeePhotos")}</h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {props.photos.map((photo) => (
          <li className="space-y-1" key={photo.id}>
            <GalleryPhotoThumb photo={photo} />
            {photo.title ? (
              <p className="font-medium text-sm">{photo.title}</p>
            ) : null}
            {photo.copyright ? (
              <p className="text-muted-foreground text-xs">
                {t("photoCopyright")}: {photo.copyright}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
