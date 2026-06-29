import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@engenty/ui-core";
import { InstructionMarkdownEditor } from "./instruction-markdown-editor";
import { SkillDetailAllowedToolsField } from "./skill-detail-allowed-tools-field";
import { SkillDetailMetadataEditor } from "./skill-detail-metadata-editor";
import type { SkillDraft } from "./skill-draft";

interface SkillDetailEditViewProps {
  allowedToolOptions: string[];
  descriptionLabel: string;
  draft: SkillDraft;
  labels: {
    allowedTools: string;
    allowedToolsHint: string;
    compatibility: string;
    detailsTitle: string;
    license: string;
    markdownTitle: string;
    metadata: string;
    metadataTitle: string;
    module: string;
    name: string;
    nameHint: string;
    metadataAddRow: string;
    metadataEmpty: string;
    selectToolsPlaceholder: string;
    addCustomTool: string;
    customToolPlaceholder: string;
    toolsTitle: string;
    editorPlaceholder: string;
  };
  onAddMetadataRow: () => void;
  onAllowedToolsChange: (next: string[]) => void;
  onBodyChange: (markdown: string) => void;
  onCompatibilityChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onLicenseChange: (value: string) => void;
  onMetadataChange: (
    id: string,
    patch: { key?: string; value?: string }
  ) => void;
  onMetadataMove: (id: string, direction: "up" | "down") => void;
  onMetadataRemove: (id: string) => void;
  onModuleIdChange: (value: string) => void;
  onNameChange: (value: string) => void;
}

export function SkillDetailEditView({
  allowedToolOptions,
  descriptionLabel,
  draft,
  labels,
  onAddMetadataRow,
  onAllowedToolsChange,
  onBodyChange,
  onCompatibilityChange,
  onDescriptionChange,
  onLicenseChange,
  onMetadataChange,
  onMetadataMove,
  onMetadataRemove,
  onModuleIdChange,
  onNameChange,
}: SkillDetailEditViewProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Card className="min-h-[40rem]">
        <CardHeader className="pb-3">
          <CardTitle>{labels.markdownTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <InstructionMarkdownEditor
            mode="wysiwyg"
            onChange={onBodyChange}
            placeholder={labels.editorPlaceholder}
            value={draft.body_markdown}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{labels.detailsTitle}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="skill-name">{labels.name}</Label>
              <Input
                id="skill-name"
                onChange={(event) => onNameChange(event.target.value)}
                value={draft.name}
              />
              <p className="text-muted-foreground text-xs">{labels.nameHint}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-description">{descriptionLabel}</Label>
              <Textarea
                id="skill-description"
                onChange={(event) => onDescriptionChange(event.target.value)}
                value={draft.description}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-module">{labels.module}</Label>
              <Input
                id="skill-module"
                onChange={(event) => onModuleIdChange(event.target.value)}
                value={draft.module_id}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-license">{labels.license}</Label>
              <Input
                id="skill-license"
                onChange={(event) => onLicenseChange(event.target.value)}
                value={draft.license}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-compatibility">
                {labels.compatibility}
              </Label>
              <Textarea
                className="min-h-24"
                id="skill-compatibility"
                onChange={(event) => onCompatibilityChange(event.target.value)}
                value={draft.compatibility}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{labels.toolsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillDetailAllowedToolsField
              addCustomLabel={labels.addCustomTool}
              customPlaceholder={labels.customToolPlaceholder}
              hint={labels.allowedToolsHint}
              label={labels.allowedTools}
              onChange={onAllowedToolsChange}
              options={allowedToolOptions}
              selectPlaceholder={labels.selectToolsPlaceholder}
              value={draft.allowed_tools}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{labels.metadataTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillDetailMetadataEditor
              addRowLabel={labels.metadataAddRow}
              emptyLabel={labels.metadataEmpty}
              entries={draft.metadata_rows}
              label={labels.metadata}
              onAdd={onAddMetadataRow}
              onChange={onMetadataChange}
              onMove={onMetadataMove}
              onRemove={onMetadataRemove}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
