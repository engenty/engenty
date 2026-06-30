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
import { HelpCircle, Pencil, Save, X } from "lucide-react";
import { useState } from "react";
import { getTemplateExamples, validateTemplate } from "../template-parser.js";
import type { MatchByConfig, MatchByLabels, ParsedCSV } from "../types.js";

interface MatchByControlProps {
  config: MatchByConfig;
  csvData: ParsedCSV;
  labels: MatchByLabels;
  onConfigChange: (config: MatchByConfig) => void;
}

export function MatchByControl({
  config,
  csvData,
  labels,
  onConfigChange,
}: MatchByControlProps) {
  const [editing, setEditing] = useState(false);
  const [templateValue, setTemplateValue] = useState(config.template ?? "");
  const [templateError, setTemplateError] = useState<string | null>(null);

  const columnOptions = csvData.headers.map((header, index) => ({
    value: String(index),
    label: `[${index}] ${header?.trim() || "(empty)"}`,
  }));

  const handleSelectColumn = (value: string) => {
    if (value === "__none__") {
      onConfigChange({ type: "none" });
      return;
    }
    const idx = Number.parseInt(value, 10);
    if (Number.isInteger(idx) && idx >= 0) {
      onConfigChange({ type: "column", columnIndex: idx });
    }
  };

  const handleSaveTemplate = () => {
    const validation = validateTemplate(templateValue, csvData.headers);
    if (!validation.valid) {
      setTemplateError(validation.error ?? "Invalid template");
      return;
    }
    onConfigChange({ type: "template", template: templateValue });
    setEditing(false);
    setTemplateError(null);
  };

  const handleClearTemplate = () => {
    setEditing(false);
    setTemplateError(null);
    setTemplateValue("");
  };

  const selectValue =
    config.type === "column" && config.columnIndex !== undefined
      ? String(config.columnIndex)
      : config.type === "template"
        ? "__template__"
        : "__none__";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 items-start gap-4">
        <div className="space-y-1">
          <Label className="font-medium text-sm">{labels.label}</Label>
          {labels.description ? (
            <p className="text-muted-foreground text-xs">
              {labels.description}
            </p>
          ) : null}
        </div>
        <div className="max-w-[50%] space-y-2">
          {editing ? (
            <>
              <div className="flex items-start gap-2">
                <Textarea
                  className="min-h-[64px] font-mono text-sm"
                  onChange={(e) => {
                    setTemplateValue(e.target.value);
                    setTemplateError(null);
                  }}
                  value={templateValue}
                />
                <div className="flex gap-1">
                  <Button
                    className="h-8 w-8"
                    onClick={handleSaveTemplate}
                    size="icon"
                    variant="ghost"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-8 w-8"
                    onClick={handleClearTemplate}
                    size="icon"
                    variant="ghost"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {templateError && (
                <p className="text-destructive text-xs">{templateError}</p>
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
                        – {example.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : config.type === "template" && config.template ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 break-all rounded border bg-muted/30 p-2 font-mono text-sm">
                  {config.template}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    className="h-8 w-8"
                    onClick={() => {
                      setTemplateValue(config.template ?? "");
                      setEditing(true);
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-8 w-8"
                    onClick={() => onConfigChange({ type: "none" })}
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
            <div className="flex items-center gap-2">
              <Select
                onValueChange={(value) => {
                  if (value === "__template__") {
                    setTemplateValue("");
                    setEditing(true);
                    return;
                  }
                  handleSelectColumn(value);
                }}
                value={selectValue}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={labels.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">{labels.none}</span>
                  </SelectItem>
                  {columnOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="__template__">
                    <span className="flex items-center gap-1">
                      <Pencil className="h-3 w-3" />
                      {labels.templateMode}
                    </span>
                  </SelectItem>
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
                        setTemplateValue("");
                        setEditing(true);
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
