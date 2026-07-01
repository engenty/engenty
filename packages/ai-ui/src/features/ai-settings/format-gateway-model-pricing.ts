const MICROS_PER_DOLLAR = 1_000_000;

export function formatMicrosPerMtok(
  micros: number | null | undefined
): string | null {
  if (micros == null) {
    return null;
  }
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(micros / MICROS_PER_DOLLAR);
}

export function formatGatewayModelPricingSummary(
  inputMicros: number | null | undefined,
  outputMicros: number | null | undefined,
  labels: {
    inLabel: string;
    outLabel: string;
    perMtokLabel: string;
    unknownLabel: string;
  }
): string {
  const input = formatMicrosPerMtok(inputMicros);
  const output = formatMicrosPerMtok(outputMicros);
  if (!(input || output)) {
    return labels.unknownLabel;
  }
  const parts: string[] = [];
  if (input) {
    parts.push(`${input} ${labels.inLabel}`);
  }
  if (output) {
    parts.push(`${output} ${labels.outLabel}`);
  }
  return `${parts.join(" · ")} ${labels.perMtokLabel}`;
}
