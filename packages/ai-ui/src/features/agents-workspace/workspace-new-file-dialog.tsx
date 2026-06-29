// "New file" modal for the Workspace tab: name + parent folder + type. Produces
// a mount-relative path and hands it to the editor (the file is persisted on the
// first Save, matching the rest of the browser).

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useState } from "react";

const ROOT = "__root__";
const NO_EXT = "__none__";
const TYPE_OPTIONS = [".md", ".txt", ".json", ".js", ".ts", ".yaml", ".sh"];

interface WorkspaceNewFileDialogProps {
  folderPaths: string[];
  onCreate: (path: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  t: (key: string) => string;
}

export function WorkspaceNewFileDialog({
  folderPaths,
  onCreate,
  onOpenChange,
  open,
  t,
}: WorkspaceNewFileDialogProps) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState(ROOT);
  const [type, setType] = useState(".md");

  const trimmed = name.trim();
  const hasExtension = /\.[a-z0-9]+$/i.test(trimmed);
  const filename =
    hasExtension || type === NO_EXT ? trimmed : `${trimmed}${type}`;
  const dir = parent === ROOT ? "" : parent;
  const path = dir ? `${dir}/${filename}` : filename;

  const submit = () => {
    if (!trimmed) {
      return;
    }
    onCreate(path);
    setName("");
    setParent(ROOT);
    setType(".md");
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workspace.newFileTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ws-new-name">{t("workspace.newFileName")}</Label>
            <Input
              id="ws-new-name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              placeholder={t("workspace.newFilePlaceholder")}
              value={name}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("workspace.newFileParent")}</Label>
            <Select onValueChange={setParent} value={parent}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT}>
                  {t("workspace.rootFolder")}
                </SelectItem>
                {folderPaths.map((folder) => (
                  <SelectItem key={folder} value={folder}>
                    <span className="font-mono">{folder}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("workspace.newFileType")}</Label>
            <Select onValueChange={setType} value={type}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((ext) => (
                  <SelectItem key={ext} value={ext}>
                    <span className="font-mono">{ext}</span>
                  </SelectItem>
                ))}
                <SelectItem value={NO_EXT}>
                  {t("workspace.typeNone")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {trimmed ? (
            <p className="font-mono text-muted-foreground text-xs">{path}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button disabled={!trimmed} onClick={submit} size="sm">
            {t("workspace.newFile")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
