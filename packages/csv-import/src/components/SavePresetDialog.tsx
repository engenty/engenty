import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";

interface SavePresetDialogProps {
  currentPresetName?: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
  open: boolean;
  saveLabel: string;
  title: string;
}

export function SavePresetDialog({
  open,
  onOpenChange,
  currentPresetName,
  onSave,
  title,
  description,
  saveLabel,
}: SavePresetDialogProps) {
  const [name, setName] = useState(currentPresetName ?? "");

  useEffect(() => {
    setName(currentPresetName ?? "");
  }, [currentPresetName, open]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onSave(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="preset-name">Preset name</Label>
          <Input
            id="preset-name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave();
              }
            }}
            value={name}
          />
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!name.trim()} onClick={handleSave}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
