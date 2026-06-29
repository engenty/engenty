import { Input, Label, Textarea } from "@engenty/ui-core";

interface DocumentMetadataEditorProps {
  final_notes: string | null;
  introduction?: string | null;
  onChange: (patch: {
    introduction?: string;
    final_notes?: string;
    reference?: string;
  }) => void;
  reference: string | null;
}

export function DocumentMetadataEditor({
  introduction,
  final_notes,
  reference,
  onChange,
}: DocumentMetadataEditorProps) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-2">
        <Label>Referenz</Label>
        <Input
          onChange={(event) => onChange({ reference: event.target.value })}
          value={reference ?? ""}
        />
      </div>
      {introduction === undefined ? null : (
        <div className="space-y-2">
          <Label>Einleitung</Label>
          <Textarea
            className="min-h-24"
            onChange={(event) => onChange({ introduction: event.target.value })}
            value={introduction ?? ""}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label>Abschlusstext</Label>
        <Textarea
          className="min-h-24"
          onChange={(event) => onChange({ final_notes: event.target.value })}
          value={final_notes ?? ""}
        />
      </div>
    </div>
  );
}
