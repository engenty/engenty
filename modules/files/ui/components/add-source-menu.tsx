/**
 * "Connect folder" for the File Manager toolbar — opens the same modal the
 * Data-tab Dateien "+" uses.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Link2 } from "lucide-react";
import { useState } from "react";
import type { FileSpaceOwnerRef } from "../file-manager-api.js";
import { ConnectFolderDialog } from "./connect-folder-dialog.js";

export function AddSourceMenu({
  currentFolderId,
  owner,
}: {
  currentFolderId: string | null;
  owner: FileSpaceOwnerRef;
}) {
  const { t } = useTranslation("files");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Link2 className="mr-1.5 size-4" />
        {t("fileManager.sources.connectFolder")}
      </Button>
      <ConnectFolderDialog
        currentFolderId={currentFolderId}
        onOpenChange={setOpen}
        open={open}
        owner={owner}
      />
    </>
  );
}
