import { Button, Card, CardContent, Checkbox, Label } from "@engenty/ui-core";
import type { AuthLocale } from "../lib/auth-i18n";
import { AUTH_TRANSLATIONS } from "../lib/auth-i18n";
import type { McpRiskLevel, SpaceOption } from "../lib/mcp-consent";

const CARD_EMBER = "oklch(64% 0.195 35)";
const RISK_LEVELS: McpRiskLevel[] = ["low", "medium", "high", "critical"];

export function McpConsentForm({
  clientLabel,
  email,
  error,
  host,
  locale,
  maxRiskLevel,
  onApprove,
  onDeny,
  onRiskChange,
  onSpaceToggle,
  selectedSpaceIds,
  spaces,
  submitting,
}: {
  clientLabel: string;
  email: string;
  error: string | null;
  host: string;
  locale: AuthLocale;
  maxRiskLevel: McpRiskLevel;
  onApprove: () => void;
  onDeny: () => void;
  onRiskChange: (risk: McpRiskLevel) => void;
  onSpaceToggle: (spaceId: string) => void;
  selectedSpaceIds: string[];
  spaces: SpaceOption[];
  submitting: boolean;
}) {
  const t = AUTH_TRANSLATIONS[locale].mcpConsent;
  return (
    <div className="space-y-4">
      <div className="space-y-1 px-1">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t.eyebrow}
        </p>
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          {t.title}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t.request(clientLabel, email)}
        </p>
        <p className="text-muted-foreground/80 text-xs">{t.via(host)}</p>
      </div>

      <Card
        className="w-full"
        style={{ boxShadow: `0 8px 40px -8px ${CARD_EMBER}38` }}
      >
        <CardContent className="space-y-5 pt-6">
          <fieldset className="space-y-2">
            <legend className="font-medium text-sm">{t.spaces}</legend>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t.spacesHelp}
            </p>
            {spaces.length > 0 ? (
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-[4px] border border-border p-3">
                {spaces.map((space) => (
                  <div className="flex items-center gap-2" key={space.id}>
                    <Checkbox
                      checked={selectedSpaceIds.includes(space.id)}
                      id={`mcp-space-${space.id}`}
                      onCheckedChange={() => onSpaceToggle(space.id)}
                    />
                    <Label
                      className="font-normal"
                      htmlFor={`mcp-space-${space.id}`}
                    >
                      {space.name}
                    </Label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-destructive text-sm">{t.noSpaces}</p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-medium text-sm">{t.risk}</legend>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t.riskHelp}
            </p>
            <div className="space-y-2">
              {RISK_LEVELS.map((risk) => (
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-[4px] border p-3 transition-colors ${
                    maxRiskLevel === risk
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                  htmlFor={`mcp-risk-${risk}`}
                  key={risk}
                >
                  <input
                    checked={maxRiskLevel === risk}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    id={`mcp-risk-${risk}`}
                    name="mcp-max-risk"
                    onChange={() => onRiskChange(risk)}
                    type="radio"
                    value={risk}
                  />
                  <span className="space-y-0.5">
                    <span className="block font-medium text-sm">
                      {t.riskOptions[risk].label}
                    </span>
                    <span className="block text-muted-foreground text-xs leading-relaxed">
                      {t.riskOptions[risk].description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t.approvalNote}
            </p>
          </fieldset>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="w-full sm:flex-1"
              disabled={submitting || selectedSpaceIds.length === 0}
              onClick={onApprove}
              size="lg"
              type="button"
            >
              {submitting ? t.approving : t.approve}
            </Button>
            <Button
              className="w-full sm:flex-1"
              disabled={submitting}
              onClick={onDeny}
              size="lg"
              type="button"
              variant="outline"
            >
              {t.deny}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
