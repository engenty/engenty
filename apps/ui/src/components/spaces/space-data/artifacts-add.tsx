/**
 * Artifacts section "+" — Folder and Page are created here; HTML, table and
 * app are handed to Copilot on a new thread (those types need generated
 * content, not an empty document).
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  AppWindow,
  FileCode2,
  FileText,
  FolderPlus,
  Table2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { reportSpaceDataOutcome } from "@/components/spaces/space-data/node-actions";
import type { SpaceSectionAddItem } from "@/components/spaces/space-section-heading";
import type { SpaceDataActions } from "@/lib/space-data-actions";
import { spaceDataArtifactPath } from "@/lib/space-routes";
import { useAskCopilotSidebar } from "@/lib/use-ask-copilot-sidebar";

export function useSpaceArtifactsAdd(input: {
  actions: SpaceDataActions;
  spaceId: string | null;
  spaceKey: string;
}): { isBusy: boolean; items: SpaceSectionAddItem[] } {
  const { actions, spaceId, spaceKey } = input;
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const askCopilot = useAskCopilotSidebar();

  if (!spaceId) {
    return { isBusy: false, items: [] };
  }

  const runCreate = async (
    work: () => Promise<{ id: string }>,
    done: string,
    openCreated: boolean
  ) => {
    try {
      const created = await work();
      toast.success(done);
      if (openCreated) {
        navigate(spaceDataArtifactPath(spaceKey, created.id));
      }
    } catch (error) {
      reportSpaceDataOutcome(error, t);
    }
  };

  const items: SpaceSectionAddItem[] = [
    {
      icon: <FolderPlus className="size-4" />,
      id: "folder",
      label: t("spaces.data.newFolder", { defaultValue: "New folder" }),
      onSelect: () =>
        void runCreate(
          () =>
            actions.createArtifact({
              name: t("spaces.data.newFolderName", {
                defaultValue: "New folder",
              }),
              type: "folder",
            }),
          t("spaces.data.folderCreated", { defaultValue: "Folder created" }),
          false
        ),
    },
    {
      icon: <FileText className="size-4" />,
      id: "page",
      label: t("spaces.data.newPage", { defaultValue: "Page" }),
      onSelect: () =>
        void runCreate(
          () =>
            actions.createPage({
              name: t("spaces.data.newPageName", { defaultValue: "New page" }),
            }),
          t("spaces.data.pageCreated", { defaultValue: "Page created" }),
          true
        ),
    },
    {
      icon: <FileCode2 className="size-4" />,
      id: "html",
      label: t("spaces.data.newHtml", { defaultValue: "HTML" }),
      onSelect: () =>
        askCopilot(
          t("spaces.data.askHtml", {
            defaultValue:
              "Create an HTML artifact in this Space's Artifacts. Ask me what it should show if I have not said.",
          })
        ),
      separatorBefore: true,
    },
    {
      icon: <Table2 className="size-4" />,
      id: "table",
      label: t("spaces.data.newTable", { defaultValue: "Table" }),
      onSelect: () =>
        askCopilot(
          t("spaces.data.askTable", {
            defaultValue:
              "Create a table artifact in this Space's Artifacts. Ask me for the columns and rows if I have not said.",
          })
        ),
    },
    {
      icon: <AppWindow className="size-4" />,
      id: "app",
      label: t("spaces.data.newApp", { defaultValue: "App" }),
      onSelect: () =>
        askCopilot(
          t("spaces.data.askApp", {
            defaultValue:
              "Build an app and store it in this Space's Artifacts. Ask me what it should do if I have not said.",
          })
        ),
    },
  ];

  return { isBusy: actions.isBusy, items };
}
