// A prompt routine's prompt, edited in place with the markdown editor the
// skills use. Saving re-briefs the routine's prompt workflow on the server.
import { Button } from "@engenty/ui-core";
import { useState } from "react";
import { InstructionMarkdownEditor } from "../agents-workspace/instruction-markdown-editor.js";
import type { RoutineDto } from "./routines-api.js";
import { useUpdateCustomRoutineMutation } from "./routines-queries.js";

export function RoutinePromptEditor({
  locale = "en",
  onDone,
  routine,
}: {
  locale?: string;
  onDone: () => void;
  routine: RoutineDto;
}) {
  const isDe = locale.startsWith("de");
  const [draft, setDraft] = useState(routine.prompt ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const updateMutation = useUpdateCustomRoutineMutation();
  const unchanged = draft.trim() === (routine.prompt ?? "").trim();

  const handleSave = async () => {
    if (!draft.trim()) {
      setErrorMsg(
        isDe ? "Der Prompt darf nicht leer sein." : "The prompt can't be empty."
      );
      return;
    }
    try {
      await updateMutation.mutateAsync({
        body: { prompt: draft },
        id: routine.id,
      });
      onDone();
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : isDe
            ? "Speichern fehlgeschlagen."
            : "Saving failed."
      );
    }
  };

  return (
    <div className="space-y-2">
      <InstructionMarkdownEditor
        disabled={updateMutation.isPending}
        mode="wysiwyg"
        onChange={setDraft}
        placeholder={
          isDe ? "Was soll die Routine tun?" : "What should the routine do?"
        }
        value={draft}
      />
      {errorMsg ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMsg}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          disabled={updateMutation.isPending}
          onClick={onDone}
          size="sm"
          type="button"
          variant="outline"
        >
          {isDe ? "Abbrechen" : "Cancel"}
        </Button>
        <Button
          disabled={updateMutation.isPending || unchanged}
          onClick={() => void handleSave()}
          size="sm"
          type="button"
        >
          {isDe ? "Speichern" : "Save"}
        </Button>
      </div>
    </div>
  );
}
