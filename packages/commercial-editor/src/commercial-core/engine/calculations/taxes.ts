export function normalizeTaxRate(rate: number | null | undefined): number {
  if (rate === null || rate === undefined) {
    return 0;
  }
  if (Number.isNaN(rate)) {
    return 0;
  }
  return Math.max(0, rate);
}
