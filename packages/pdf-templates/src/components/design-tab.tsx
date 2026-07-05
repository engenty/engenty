import {
  Button,
  Card,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PDF_TEMPLATE_FONT_FAMILIES } from "../defaults.js";
import { getAvailableWeights, getClosestWeight } from "../font-weights.js";
import type { PdfTemplateSettings } from "../types.js";

interface DesignTabProps {
  onSettingsChange: (nextValue: PdfTemplateSettings) => void;
  onUploadAsset: (file: File) => Promise<void>;
  settings: PdfTemplateSettings;
  uploading: boolean;
}

function updateTypographyField(
  settings: PdfTemplateSettings,
  key: keyof PdfTemplateSettings["typography"],
  field: "family" | "size" | "weight",
  value: number | string
) {
  return {
    ...settings,
    typography: {
      ...settings.typography,
      [key]: {
        ...settings.typography[key],
        [field]: value,
      },
    },
  };
}

function SettingRow({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex w-full flex-row items-center justify-between gap-2">
      <Label className="w-24 shrink-0 text-xs">{label}</Label>
      <div className="min-w-8">{children}</div>
    </div>
  );
}

function hexToValue(hex: string): string {
  return hex.startsWith("#") ? hex.slice(1) : hex;
}

function valueToHex(value: string): string {
  if (!value) {
    return "#000000";
  }
  return value.startsWith("#") ? value : `#${value}`;
}

function TypographyWeightSelect({
  family,
  onWeightChange,
  value,
}: {
  family: string;
  onWeightChange: (weight: number) => void;
  value: number;
}) {
  const availableWeights = useMemo(() => getAvailableWeights(family), [family]);
  const isValidWeight = availableWeights.some((w) => w.value === value);
  const displayWeight = isValidWeight ? value : getClosestWeight(family, value);

  // Adjust weight if current is invalid for this font
  useEffect(() => {
    if (!isValidWeight && displayWeight !== value) {
      onWeightChange(displayWeight);
    }
  }, [family, isValidWeight, displayWeight, value, onWeightChange]);

  return (
    <Select
      onValueChange={(v) => onWeightChange(Number.parseInt(v, 10))}
      value={String(displayWeight)}
    >
      <SelectTrigger className="h-8 w-full text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {availableWeights.map((weight) => (
          <SelectItem key={weight.value} value={String(weight.value)}>
            {weight.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ColorInputRow({
  colorValue,
  label,
  onColorChange,
}: {
  colorValue: string;
  label: string;
  onColorChange: (value: string) => void;
}) {
  const [localHex, setLocalHex] = useState(hexToValue(colorValue));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalHex(hexToValue(colorValue));
  }, [colorValue]);

  const handleHexChange = (newValue: string) => {
    const filtered = newValue.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
    setLocalHex(filtered);
    if (filtered.length === 6) {
      onColorChange(valueToHex(filtered));
    }
  };

  const handleHexBlur = () => {
    if (localHex.length === 6) {
      onColorChange(valueToHex(localHex));
    } else {
      // Restore original if invalid
      setLocalHex(hexToValue(colorValue));
    }
  };

  const handleHexKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      if (localHex.length === 6) {
        onColorChange(valueToHex(localHex));
      }
      inputRef.current?.blur();
    }
  };

  return (
    <SettingRow label={label}>
      <div className="flex items-center gap-2">
        <Input
          className="h-8 w-20 font-mono text-xs"
          onBlur={handleHexBlur}
          onChange={(event) => handleHexChange(event.target.value)}
          onKeyDown={handleHexKeyDown}
          placeholder="000000"
          ref={inputRef}
          type="text"
          value={localHex}
        />
        <Input
          className="h-8 w-8 shrink-0 cursor-pointer p-1 py-0.5"
          onChange={(event) => onColorChange(event.target.value)}
          type="color"
          value={colorValue}
        />
      </div>
    </SettingRow>
  );
}

export function DesignTab({
  onSettingsChange,
  onUploadAsset,
  settings,
  uploading,
}: DesignTabProps) {
  return (
    <div className="space-y-2 overflow-auto p-2 sm:p-3">
      <Card className="space-y-1.5 p-2 sm:p-3" variant="form">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Colors
        </h3>
        {(
          [
            ["text", "Text"],
            ["muted", "Muted"],
            ["accent", "Accent"],
            ["secondary", "Secondary"],
            ["lines", "Lines"],
            ["danger", "Danger"],
          ] as const
        ).map(([key, label]) => (
          <ColorInputRow
            colorValue={settings.colors[key]}
            key={key}
            label={label}
            onColorChange={(value) =>
              onSettingsChange({
                ...settings,
                colors: {
                  ...settings.colors,
                  [key]: value,
                },
              })
            }
          />
        ))}
      </Card>

      <Card className="space-y-1.5 p-2 sm:p-3" variant="form">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Backgrounds
        </h3>
        {(
          [
            ["accent", "Accent"],
            ["muted", "Muted"],
            ["page", "Page"],
          ] as const
        ).map(([key, label]) => (
          <ColorInputRow
            colorValue={settings.colors.backgrounds[key]}
            key={key}
            label={label}
            onColorChange={(value) =>
              onSettingsChange({
                ...settings,
                colors: {
                  ...settings.colors,
                  backgrounds: {
                    ...settings.colors.backgrounds,
                    [key]: value,
                  },
                },
              })
            }
          />
        ))}
      </Card>

      <Card className="space-y-1.5 p-2 sm:p-3" variant="form">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Page
        </h3>
        <SettingRow label="Base Font Size">
          <Input
            className="h-8"
            min={1}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                base_font_size: Number(event.target.value) || 11,
              })
            }
            type="number"
            value={settings.base_font_size}
          />
        </SettingRow>
        {(
          [
            ["top", "Top"],
            ["right", "Right"],
            ["bottom", "Bottom"],
            ["left", "Left"],
          ] as const
        ).map(([key, label]) => (
          <SettingRow key={key} label={`Margin ${label}`}>
            <Input
              className="h-8"
              min={0}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  margins: {
                    ...settings.margins,
                    [key]: Number(event.target.value) || 0,
                  },
                })
              }
              type="number"
              value={settings.margins[key]}
            />
          </SettingRow>
        ))}
      </Card>

      <Card className="space-y-1.5 p-2 sm:p-3" variant="form">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Letterhead
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild disabled={uploading} size="sm" variant="outline">
            <label className="cursor-pointer">
              <Upload className="h-4 w-4" />
              Upload
              <input
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void onUploadAsset(file);
                  }
                }}
                type="file"
              />
            </label>
          </Button>
          {settings.letterhead.asset_url ? (
            <Button
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  letterhead: { ...settings.letterhead, asset_url: null },
                })
              }
              size="sm"
              variant="ghost"
            >
              <X className="h-4 w-4" />
              Remove
            </Button>
          ) : null}
        </div>
        {settings.letterhead.asset_url ? (
          <img
            alt="Letterhead preview"
            className="max-h-24 rounded border object-contain"
            height={96}
            src={settings.letterhead.asset_url}
            width={96}
          />
        ) : (
          <div className="rounded border border-dashed px-3 py-4 text-center text-muted-foreground text-xs">
            Upload a PNG, JPEG, GIF, or WebP image.
          </div>
        )}
        <SettingRow label="Scale">
          <Select
            onValueChange={(value) =>
              onSettingsChange({
                ...settings,
                letterhead: {
                  ...settings.letterhead,
                  fit: value as PdfTemplateSettings["letterhead"]["fit"],
                },
              })
            }
            value={settings.letterhead.fit}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contain">Contain</SelectItem>
              <SelectItem value="cover">Cover</SelectItem>
              <SelectItem value="fill">Fill</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Horizontal">
          <Select
            onValueChange={(value) =>
              onSettingsChange({
                ...settings,
                letterhead: {
                  ...settings.letterhead,
                  horizontal:
                    value as PdfTemplateSettings["letterhead"]["horizontal"],
                },
              })
            }
            value={settings.letterhead.horizontal}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Vertical">
          <Select
            onValueChange={(value) =>
              onSettingsChange({
                ...settings,
                letterhead: {
                  ...settings.letterhead,
                  vertical:
                    value as PdfTemplateSettings["letterhead"]["vertical"],
                },
              })
            }
            value={settings.letterhead.vertical}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">Top</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="bottom">Bottom</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </Card>

      <Card className="space-y-2 p-2 sm:p-3" variant="form">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Typography
        </h3>
        {(
          [
            ["title", "Title"],
            ["headlines", "Headlines"],
            ["text", "Text"],
            ["fixed", "Fixed"],
            ["small", "Small"],
          ] as const
        ).map(([key, label]) => (
          <div
            className="grid grid-cols-1 items-end gap-x-2 gap-y-1 rounded border p-2 sm:grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_4.5rem]"
            key={key}
          >
            <div className="pb-1 font-medium text-xs sm:pt-2 sm:pb-0">
              {label}
            </div>
            <div className="min-w-0 sm:col-span-1">
              <Label className="sr-only">{label} family</Label>
              <Select
                onValueChange={(value) => {
                  const currentWeight = settings.typography[key].weight;
                  const closestWeight = getClosestWeight(value, currentWeight);
                  onSettingsChange(
                    updateTypographyField(
                      updateTypographyField(settings, key, "family", value),
                      key,
                      "weight",
                      closestWeight
                    )
                  );
                }}
                value={settings.typography[key].family}
              >
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PDF_TEMPLATE_FONT_FAMILIES.map((family) => (
                    <SelectItem key={family} value={family}>
                      {family}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-0.5 block text-muted-foreground text-xxs leading-none">
                Size
              </Label>
              <Input
                className="h-8"
                onChange={(event) =>
                  onSettingsChange(
                    updateTypographyField(
                      settings,
                      key,
                      "size",
                      event.target.value
                    )
                  )
                }
                value={settings.typography[key].size}
              />
            </div>
            <div>
              <Label className="mb-0.5 block text-muted-foreground text-xxs leading-none">
                Weight
              </Label>
              <TypographyWeightSelect
                family={settings.typography[key].family}
                onWeightChange={(weight) =>
                  onSettingsChange(
                    updateTypographyField(settings, key, "weight", weight)
                  )
                }
                value={settings.typography[key].weight}
              />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
