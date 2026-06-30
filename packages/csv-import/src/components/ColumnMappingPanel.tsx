import {
  Badge,
  Button,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@engenty/ui-core";
import { AlertCircle, HelpCircle, Pencil, Save, X } from "lucide-react";
import { useState } from "react";
import { getTemplateExamples, validateTemplate } from "../template-parser.js";
import type { ColumnMapping, ImportFieldDefinition } from "../types.js";

interface ColumnMappingPanelProps {
  csvHeaders: string[];
  fields: ImportFieldDefinition[];
  labels: {
    lowConfidence: string;
    missingRequired: string;
    notMapped: string;
    templateMode: string;
    templateModeDescription: string;
    templateSyntax: string;
  };
  mappings: ColumnMapping[];
  onMappingChange: (
    fieldKey: string,
    csvColumnIndex: number | null,
    template?: { isTemplate: boolean; templateStr: string }
  ) => void;
}

export function ColumnMappingPanel({
  fields,
  mappings,
  csvHeaders,
  onMappingChange,
  labels,
}: ColumnMappingPanelProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [templateValue, setTemplateValue] = useState("");
  const [templateError, setTemplateError] = useState<string | null>(null);
  const getMapping = (fieldKey: string) =>
    mappings.find((mapping) => mapping.fieldKey === fieldKey);

  const requiredUnmapped = fields.filter((field) => {
    if (!field.required) {
      return false;
    }
    const mapping = getMapping(field.key);
    return !mapping || (!mapping.isTemplate && mapping.csvColumnIndex === null);
  });

  return (
    <div className="space-y-4">
      {requiredUnmapped.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">
              {labels.missingRequired}
            </p>
            <p className="text-destructive/80">
              {requiredUnmapped.map((field) => field.label).join(", ")}
            </p>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {fields.map((field) => {
          const mapping = getMapping(field.key);
          const isEditing = editingField === field.key;

          return (
            <div
              className="grid min-w-0 grid-cols-2 items-start gap-4"
              key={field.key}
            >
              <div className="min-w-0 space-y-1">
                <Label className="font-medium text-sm">
                  {field.label}{" "}
                  {field.required && (
                    <span className="text-destructive">*</span>
                  )}
                </Label>
                {field.description && (
                  <p className="text-muted-foreground text-xs">
                    {field.description}
                  </p>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                {isEditing ? (
                  <>
                    <div className="flex items-start gap-2">
                      <Textarea
                        className="min-h-[64px] font-mono text-sm"
                        onChange={(event) => {
                          setTemplateValue(event.target.value);
                          setTemplateError(null);
                        }}
                        value={templateValue}
                      />
                      <div className="flex gap-1">
                        <Button
                          className="h-8 w-8"
                          onClick={() => {
                            const validation = validateTemplate(
                              templateValue,
                              csvHeaders
                            );
                            if (!validation.valid) {
                              setTemplateError(
                                validation.error ?? "Invalid template"
                              );
                              return;
                            }
                            onMappingChange(field.key, null, {
                              isTemplate: true,
                              templateStr: templateValue,
                            });
                            setEditingField(null);
                            setTemplateError(null);
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingField(null);
                            setTemplateError(null);
                            setTemplateValue("");
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {templateError && (
                      <p className="text-destructive text-xs">
                        {templateError}
                      </p>
                    )}
                    <div className="flex items-start gap-2 rounded bg-muted/50 p-2 text-xs">
                      <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" />
                      <div className="space-y-1">
                        <p className="font-medium">{labels.templateSyntax}</p>
                        {getTemplateExamples().map((example) => (
                          <div key={example.template}>
                            <code className="rounded bg-background px-1 text-xxs">
                              {example.template}
                            </code>
                            <span className="ml-1 text-muted-foreground">
                              - {example.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : mapping?.isTemplate ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 break-all rounded border bg-muted/30 p-2 font-mono text-sm">
                        {mapping.template}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          className="h-8 w-8"
                          onClick={() => {
                            setTemplateValue(mapping.template ?? "");
                            setEditingField(field.key);
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          className="h-8 w-8"
                          onClick={() => onMappingChange(field.key, null)}
                          size="icon"
                          variant="ghost"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Badge variant="secondary">{labels.templateMode}</Badge>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-2">
                    <Select
                      onValueChange={(value) =>
                        onMappingChange(
                          field.key,
                          value === "__unmapped__"
                            ? null
                            : Number.parseInt(value, 10)
                        )
                      }
                      value={
                        mapping?.csvColumnIndex?.toString() ?? "__unmapped__"
                      }
                    >
                      <SelectTrigger className="h-8 w-[calc(100%-2rem)] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unmapped__">
                          <span className="text-muted-foreground">
                            {labels.notMapped}
                          </span>
                        </SelectItem>
                        {csvHeaders.map((header, index) => (
                          <SelectItem key={header} value={String(index)}>
                            <span className="mr-2 font-mono text-muted-foreground text-xs">
                              [{index}]
                            </span>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          className="h-8 w-8 shrink-0"
                          size="icon"
                          variant="ghost"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80">
                        <div className="space-y-3">
                          <div>
                            <h4 className="mb-1 font-semibold text-sm">
                              {labels.templateMode}
                            </h4>
                            <p className="text-muted-foreground text-xs">
                              {labels.templateModeDescription}
                            </p>
                          </div>
                          <Button
                            className="w-full"
                            onClick={() => {
                              setTemplateValue(mapping?.template ?? "");
                              setTemplateError(null);
                              setEditingField(field.key);
                            }}
                            size="sm"
                            variant="outline"
                          >
                            <Pencil className="mr-2 h-3 w-3" />
                            {labels.templateMode}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    {mapping?.confidence !== undefined &&
                      mapping.confidence < 0.8 &&
                      mapping.csvColumnIndex !== null && (
                        <Badge
                          className="whitespace-nowrap"
                          variant="secondary"
                        >
                          {labels.lowConfidence}
                        </Badge>
                      )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
