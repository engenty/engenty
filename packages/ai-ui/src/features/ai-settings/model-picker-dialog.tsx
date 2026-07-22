import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
} from "@engenty/ui-core";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  GatewayModelOption,
  GatewayModelPriceTier,
} from "../../lib/admin/gateway-model-options-api";
import {
  formatModelPrice,
  ModelCapabilityChips,
  withinPriceTier,
} from "./model-catalog-display";

interface ModelPickerDialogProps {
  inheritedValue: string;
  maxPriceTier: "all" | GatewayModelPriceTier;
  models: GatewayModelOption[];
  onOpenChange: (open: boolean) => void;
  onSelect: (modelId: string | null) => void;
  open: boolean;
  purposeLabel: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  value: string | null;
}

function matchesSearch(model: GatewayModelOption, query: string): boolean {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  return (
    model.model_id.toLowerCase().includes(needle) ||
    (model.display_name?.toLowerCase().includes(needle) ?? false)
  );
}

export function ModelPickerDialog({
  inheritedValue,
  maxPriceTier,
  models,
  onOpenChange,
  onSelect,
  open,
  purposeLabel,
  t,
  value,
}: ModelPickerDialogProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      models
        .filter((m) => withinPriceTier(m, maxPriceTier))
        .filter((m) => matchesSearch(m, search))
        .sort((a, b) => a.model_id.localeCompare(b.model_id)),
    [models, maxPriceTier, search]
  );

  const choose = (modelId: string | null) => {
    onSelect(modelId);
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("picker.title", { purpose: purposeLabel })}
          </DialogTitle>
          <DialogDescription>{t("picker.description")}</DialogDescription>
        </DialogHeader>

        <Input
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("fields.modelSearchPlaceholder")}
          value={search}
        />

        <ScrollArea className="h-[min(60vh,440px)] pr-3">
          <div className="flex flex-col gap-1">
            <button
              className="flex items-start justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left hover:bg-muted/50 data-[active=true]:border-border data-[active=true]:bg-muted/40"
              data-active={value == null}
              onClick={() => choose(null)}
              type="button"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm">
                  {t("matrix.inheritActionLong")}
                </div>
                <div className="truncate font-mono text-muted-foreground text-xs">
                  {t("matrix.inheritHint", { model: inheritedValue })}
                </div>
              </div>
              {value == null ? (
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : null}
            </button>

            {filtered.map((model) => {
              const price = formatModelPrice(model);
              return (
                <button
                  className="flex items-start justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left hover:bg-muted/50 data-[active=true]:border-border data-[active=true]:bg-muted/40"
                  data-active={value === model.model_id}
                  key={model.model_id}
                  onClick={() => choose(model.model_id)}
                  type="button"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="truncate font-medium text-sm">
                      {model.display_name ?? model.model_id}
                    </div>
                    <div className="truncate font-mono text-muted-foreground text-xs">
                      {model.model_id}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      {price ? (
                        <span className="font-mono tabular-nums">{price}</span>
                      ) : null}
                      {model.price_tier ? (
                        <Badge className="font-normal" variant="outline">
                          {t(`fields.priceTier.${model.price_tier}`)}
                        </Badge>
                      ) : null}
                      <ModelCapabilityChips model={model} t={t} />
                    </div>
                  </div>
                  {value === model.model_id ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })}

            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-muted-foreground text-sm">
                {t("fields.modelSearchEmpty")}
              </p>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
