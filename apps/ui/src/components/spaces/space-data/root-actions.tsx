/**
 * The Data tab's top-bar CTA (PLAN-space-data-agent-crud P3.1/P3.2).
 *
 * **In the top nav bar, not a toolbar inside the content.** That layout was
 * rejected once already for this pane: the CTAs and the info go in the top bar,
 * the content fills the main area, and what is left goes in a bottom info bar.
 *
 * "New folder" needs somewhere to put it, and at the tree's top level the roots
 * ARE the mounted modules — you cannot make a folder beside them, because that
 * would mean mounting a module. So the button asks WHICH root first, and offers
 * only the ones whose module actually has folders. A space with no such module
 * shows no button at all rather than one that opens an empty menu.
 *
 * Shape is the shell's, not this page's: the primary `Button size="sm"` with a
 * leading `Plus` that `TasksTopbarActions` and the spaces list already use, so
 * the create action reads the same in every topbar. `AppTopbar` compacts it to
 * `h-7 / text-xs / size-3.5` through the `contentBlend` cascade — which is the
 * page's job to switch on, not the button's to hard-code.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import type { SpaceDataCapabilities } from "@/lib/api/space-data-client";
import { useSpaceDataActions } from "@/lib/space-data-actions";
import { reportSpaceDataOutcome } from "./node-actions";

export function SpaceDataRootActions({
  capabilitiesByRoot,
  spaceId,
}: {
  capabilitiesByRoot: Record<string, SpaceDataCapabilities>;
  spaceId: string | null;
}) {
  const { t } = useTranslation("common");
  const actions = useSpaceDataActions(spaceId);
  const creatable = Object.entries(capabilitiesByRoot)
    .filter(([, capabilities]) => capabilities.canCreate)
    .map(([root]) => root);

  if (!spaceId || creatable.length === 0) {
    return null;
  }

  const create = async (root: string) => {
    try {
      await actions.createFolder({
        name: t("spaces.data.newFolderName", { defaultValue: "New folder" }),
        parentPath: root,
      });
      toast.success(
        t("spaces.data.folderCreated", { defaultValue: "Folder created" })
      );
    } catch (error) {
      reportSpaceDataOutcome(error, t);
    }
  };

  // One creatable root is the common case (a space with `files` mounted), and
  // making someone choose from a menu of one is friction for no information.
  if (creatable.length === 1) {
    const root = creatable[0] as string;
    return (
      <Button
        disabled={actions.isBusy}
        onClick={() => void create(root)}
        size="sm"
      >
        <Plus className="mr-1.5 size-3.5" />
        {t("spaces.data.newFolder", { defaultValue: "New folder" })}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={actions.isBusy} size="sm">
          <Plus className="mr-1.5 size-3.5" />
          {t("spaces.data.newFolder", { defaultValue: "New folder" })}
          <ChevronDown className="ml-1.5 size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {creatable.map((root) => (
          <DropdownMenuItem key={root} onSelect={() => void create(root)}>
            {root}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
