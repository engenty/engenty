import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
} from "@engenty/ui-core";
import { useCallback, useState } from "react";
import type { ProjectPhase } from "../api.js";

interface PhaseFormDialogProps {
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    title: string;
    start_date: string | null;
    end_date: string | null;
    is_main: boolean;
    is_public: boolean;
  }) => Promise<void>;
  open: boolean;
  phase?: ProjectPhase | null;
}

export function PhaseFormDialog({
  open,
  onOpenChange,
  onSubmit,
  phase,
}: PhaseFormDialogProps) {
  const { t } = useTranslation("projects");
  const [title, setTitle] = useState(phase?.title ?? "");
  const [startDate, setStartDate] = useState(phase?.start_date ?? "");
  const [endDate, setEndDate] = useState(phase?.end_date ?? "");
  const [isMain, setIsMain] = useState(phase?.is_main ?? false);
  const [isPublic, setIsPublic] = useState(phase?.is_public ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!title.trim()) {
        setError("Title is required");
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit({
          title: title.trim(),
          start_date: startDate || null,
          end_date: endDate || null,
          is_main: isMain,
          is_public: isPublic,
        });
        onOpenChange(false);
        setTitle("");
        setStartDate("");
        setEndDate("");
        setIsMain(false);
        setIsPublic(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSubmitting(false);
      }
    },
    [title, startDate, endDate, isMain, isPublic, onSubmit, onOpenChange]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setTitle(phase?.title ?? "");
        setStartDate(phase?.start_date ?? "");
        setEndDate(phase?.end_date ?? "");
        setIsMain(phase?.is_main ?? false);
        setIsPublic(phase?.is_public ?? false);
        setError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange, phase]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent aria-describedby="phase-form-dialog-description">
        <DialogHeader>
          <DialogTitle>
            {phase ? "Edit phase" : t("detail.addPhase")}
          </DialogTitle>
          <DialogDescription
            className="sr-only"
            id="phase-form-dialog-description"
          >
            {phase ? "Edit phase" : t("detail.addPhase")}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="phase-title">Title</Label>
            <Input
              className="mt-1"
              id="phase-title"
              onChange={(e) => setTitle(e.target.value)}
              required
              value={title}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phase-start">Start date</Label>
              <DatePicker
                className="mt-1 w-full"
                onChange={(nextValue) => setStartDate(nextValue ?? "")}
                value={startDate || null}
              />
            </div>
            <div>
              <Label htmlFor="phase-end">End date</Label>
              <DatePicker
                className="mt-1 w-full"
                onChange={(nextValue) => setEndDate(nextValue ?? "")}
                value={endDate || null}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={isMain}
              id="phase-main"
              onCheckedChange={setIsMain}
            />
            <Label htmlFor="phase-main">Main phase</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={isPublic}
              id="phase-public"
              onCheckedChange={setIsPublic}
            />
            <Label htmlFor="phase-public">Visible to client</Label>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={submitting} type="submit">
              {phase ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
