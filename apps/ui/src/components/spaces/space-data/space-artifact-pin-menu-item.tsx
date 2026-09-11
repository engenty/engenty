import { useTranslation } from "@engenty/i18n/ui";
import { DropdownMenuItem } from "@engenty/ui-core";
import { Pin, PinOff } from "lucide-react";
import { useSpaceArtifactPins } from "@/lib/space-artifact-pins-persistence";

/** Pin / unpin a space artifact onto the Work sidebar and dashboard. */
export function SpaceArtifactPinMenuItem({
  artifactId,
  spaceId,
}: {
  artifactId: string;
  spaceId: string | null;
}) {
  const { t } = useTranslation("common");
  const pins = useSpaceArtifactPins(spaceId);
  if (!spaceId) {
    return null;
  }
  const pinned = pins.isPinned(artifactId);
  return (
    <DropdownMenuItem onSelect={() => pins.toggle(artifactId)}>
      {pinned ? (
        <PinOff className="mr-2 size-4" />
      ) : (
        <Pin className="mr-2 size-4" />
      )}
      {pinned
        ? t("spaces.artifacts.unpin", { defaultValue: "Unpin" })
        : t("spaces.artifacts.pin", { defaultValue: "Pin" })}
    </DropdownMenuItem>
  );
}
