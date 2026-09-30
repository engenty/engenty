/**
 * The space home's header, built like a project's: the space's name with its
 * description under it (edited in place), the people in the space on the
 * right — a click opens the people picker — and, when set, a cover behind it
 * all. Without a cover it is a plain header with "Add cover" on hover.
 *
 * The cover lives in the space's own key/value store (`core.space_settings`);
 * colours, gradients and image links for now — uploads need media routes
 * core does not have yet.
 */
import type { Cover } from "@engenty/covers";
import { CoverBand, CoverDialog } from "@engenty/covers/ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AvatarStack,
  type AvatarStackProfile,
  Button,
  cn,
  EditableText,
} from "@engenty/ui-core";
import { ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { SpacePeopleDialog } from "@/components/spaces/SpacePeopleDialog";
import {
  memberLabel,
  SpaceMemberRemoveConfirm,
  useSpaceRoster,
} from "@/components/spaces/space-roster";
import type { Space } from "@/lib/api/spaces-client";
import { useUpdateSpaceDetailsMutation } from "@/lib/spaces-queries";

/** Cover images need an owner-scoped media route; none for spaces yet. */
const NO_COVER_MEDIA = {};

export function SpaceHomeHeader({
  canManage,
  className,
  space,
}: {
  canManage: boolean;
  /** The header's column (width, padding) — the page's content row. */
  className?: string;
  space: Space;
}) {
  const { t } = useTranslation("common");
  const roster = useSpaceRoster(space.id);
  const details = useUpdateSpaceDetailsMutation(space.id);
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const setCover = (cover: Cover | null) => details.mutate({ cover });

  const profiles = useMemo<AvatarStackProfile[]>(
    () =>
      roster.members.map((member) => ({
        full_name: memberLabel(member),
        id: member.userId,
      })),
    [roster.members]
  );
  const visibility =
    space.visibility === "private"
      ? t("spaces.home.teamSpace.restricted", {
          defaultValue: "Restricted to members.",
        })
      : t("spaces.home.teamSpace.open", { defaultValue: "Open to the team." });
  const team =
    profiles.length > 0 ? (
      <button
        aria-label={t("spaces.members.manageAction", {
          defaultValue: "Manage people",
        })}
        className="cursor-pointer rounded-full transition-opacity hover:opacity-90"
        onClick={() => roster.setPickerOpen(true)}
        title={visibility}
        type="button"
      >
        <AvatarStack max={6} profiles={profiles} size="lg" />
      </button>
    ) : null;

  const description = space.description?.trim() || null;
  const descriptionLine = canManage ? (
    <EditableText
      aria-label={t("spaces.home.descriptionLabel", {
        defaultValue: "Description",
      })}
      as="p"
      className={cn(
        "min-w-0 transition-opacity",
        !description &&
          "opacity-0 focus:opacity-100 group-hover/header:opacity-60"
      )}
      onSave={(next: string) => {
        const value = next.trim() || null;
        if (value !== description) {
          details.mutate({ description: value });
        }
      }}
      placeholder={t("spaces.home.addDescription", {
        defaultValue: "Add a description…",
      })}
      value={description ?? ""}
      variant="plain"
    />
  ) : description ? (
    <p className="line-clamp-2">{description}</p>
  ) : null;

  const people = (
    <>
      <SpacePeopleDialog canManage={canManage} roster={roster} />
      <SpaceMemberRemoveConfirm roster={roster} />
    </>
  );

  if (space.cover) {
    return (
      <header className={cn("group/header w-full shrink-0 pt-7", className)}>
        <CoverBand
          className="rounded-2xl shadow-sm"
          cover={space.cover}
          editable={canManage}
          header={
            <div className="flex items-end justify-between gap-4 px-7 py-5">
              <div className="min-w-0">
                <h1 className="font-heading font-semibold text-[28px] leading-9 tracking-tight">
                  {space.name}
                </h1>
                <div className="mt-0.5 min-w-0 text-[15px] opacity-90">
                  {descriptionLine}
                </div>
              </div>
              <span className="shrink-0 font-medium text-sm opacity-90">
                {visibility}
              </span>
            </div>
          }
          media={NO_COVER_MEDIA}
          minHeight={200}
          onChange={canManage ? setCover : undefined}
          topRight={team}
        />
        {people}
      </header>
    );
  }

  return (
    <header
      className={cn(
        "group/header flex w-full shrink-0 items-end justify-between gap-4 pt-7",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="font-semibold @min-[52rem]:text-3xl text-2xl tracking-tight">
          {space.name}
        </h1>
        <div className="mt-1 min-w-0 text-[13px] text-muted-foreground leading-relaxed">
          {descriptionLine}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {canManage ? (
          <Button
            className="h-7 gap-1.5 px-2.5 text-muted-foreground/70 text-xs opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/header:opacity-100"
            onClick={() => setCoverDialogOpen(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ImageIcon aria-hidden className="size-3.5" />
            {t("covers.add_cover_hint")}
          </Button>
        ) : null}
        {team}
      </div>
      {canManage ? (
        <CoverDialog
          currentCover={null}
          media={NO_COVER_MEDIA}
          onApplyCover={setCover}
          onOpenChange={setCoverDialogOpen}
          open={coverDialogOpen}
          pending={details.isPending}
        />
      ) : null}
      {people}
    </header>
  );
}
