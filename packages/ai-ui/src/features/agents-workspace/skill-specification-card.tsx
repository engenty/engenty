import { EditableText } from "@engenty/ui-core";
import type { ReactNode } from "react";
import type { SkillDraft } from "./skill-draft";

interface SkillSpecificationCardProps {
  draft: SkillDraft;
  labels: {
    allowedTools: string;
    compatibility: string;
    description: string;
    license: string;
    metadata: string;
    name: string;
    title: string;
  };
  nameHint: string;
  onAllowedToolsChange: (value: string) => void;
  onCompatibilityChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onLicenseChange: (value: string) => void;
  onMetadataChange: (index: number, value: string) => void;
  onNameChange: (value: string) => void;
  onTitleChange: (value: string) => void;
}

function SpecRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <li className="text-foreground">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground">: </span>
      {children}
    </li>
  );
}

export function SkillSpecificationCard({
  draft,
  labels,
  nameHint,
  onAllowedToolsChange,
  onCompatibilityChange,
  onDescriptionChange,
  onLicenseChange,
  onMetadataChange,
  onNameChange,
  onTitleChange,
}: SkillSpecificationCardProps) {
  return (
    <div className="mb-6 rounded-md border bg-muted/30 p-4 text-sm">
      <ul className="space-y-1 font-mono text-xs leading-relaxed">
        <li className="-mb-0.5 text-muted-foreground text-xs italic">
          {nameHint}
        </li>
        <SpecRow label="name">
          <EditableText
            as="span"
            className="inline rounded-sm px-1 py-0.5 text-foreground"
            onSave={onNameChange}
            onUpdate={onNameChange}
            placeholder={labels.name}
            value={draft.name}
            variant="filled"
          />
        </SpecRow>
        <SpecRow label="title">
          <EditableText
            as="span"
            className="inline rounded-sm px-1 py-0.5 text-foreground"
            onSave={onTitleChange}
            onUpdate={onTitleChange}
            placeholder={labels.title}
            value={draft.title}
            variant="filled"
          />
        </SpecRow>
        <SpecRow label="description">
          <EditableText
            as="span"
            className="inline rounded-sm px-1 py-0.5 text-foreground"
            onEnter={() => {}}
            onSave={onDescriptionChange}
            onUpdate={onDescriptionChange}
            placeholder={labels.description}
            value={draft.description}
            variant="filled"
          />
        </SpecRow>
        <SpecRow label="license">
          <EditableText
            as="span"
            className="inline rounded-sm px-1 py-0.5 text-foreground"
            onSave={onLicenseChange}
            onUpdate={onLicenseChange}
            placeholder={labels.license}
            value={draft.license}
            variant="filled"
          />
        </SpecRow>
        <SpecRow label="compatibility">
          <EditableText
            as="span"
            className="inline rounded-sm px-1 py-0.5 text-foreground"
            onSave={onCompatibilityChange}
            onUpdate={onCompatibilityChange}
            placeholder={labels.compatibility}
            value={draft.compatibility}
            variant="filled"
          />
        </SpecRow>
      </ul>

      <div className="mt-4 space-y-2">
        <p className="font-medium text-foreground text-xs">{labels.metadata}</p>
        <ul className="ml-3 space-y-1 border-border border-l pl-3 font-mono text-xs">
          <SpecRow label="module_id">
            <span className="text-foreground">{draft.module_id}</span>
          </SpecRow>
          {draft.metadata_rows.map((entry, index) => (
            <SpecRow key={entry.id} label={entry.key}>
              <EditableText
                as="span"
                className="inline rounded-sm px-1 py-0.5 text-foreground"
                onSave={(value) => onMetadataChange(index, value)}
                onUpdate={(value) => onMetadataChange(index, value)}
                placeholder={entry.key}
                value={entry.value}
                variant="filled"
              />
            </SpecRow>
          ))}
        </ul>
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="font-medium text-muted-foreground text-xxs uppercase tracking-widest">
          {labels.allowedTools}
        </p>
        <EditableText
          as="p"
          className="rounded-sm px-1 py-0.5 font-mono text-foreground text-xs"
          onSave={onAllowedToolsChange}
          onUpdate={onAllowedToolsChange}
          placeholder={labels.allowedTools}
          value={draft.allowed_tools.join(" ")}
          variant="filled"
        />
      </div>
    </div>
  );
}
