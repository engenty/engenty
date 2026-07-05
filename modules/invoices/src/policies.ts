import type {
  PluginPolicyDecision,
  PluginPolicyInput,
  PluginProfilePolicy,
  PluginResultPolicy,
} from "@engenty/plugin-sdk";

function hasProfile(input: PluginPolicyInput, profile: string): boolean {
  return input.auth.roleProfiles.includes(profile);
}

function isWriteOperation(input: PluginPolicyInput): boolean {
  if (
    input.requiredCapabilities.some((capability) =>
      capability.includes(".write")
    )
  ) {
    return true;
  }
  const lower = input.operationId.toLowerCase();
  return (
    lower.endsWith(".create") ||
    lower.endsWith(".update") ||
    lower.endsWith(".delete") ||
    lower.endsWith(".upsert") ||
    lower.includes(".write")
  );
}

function getCurrentYear(): number {
  return new Date().getUTCFullYear();
}

function extractYear(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.match(/^(\d{4})/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function deny(reason: string): PluginPolicyDecision {
  return { action: "deny", reason };
}

function collectInvoiceDates(result: unknown): string[] {
  if (!result) {
    return [];
  }
  if (Array.isArray(result)) {
    return result
      .map((item) =>
        item && typeof item === "object"
          ? (item as { date?: unknown }).date
          : undefined
      )
      .filter((date): date is string => typeof date === "string");
  }
  if (typeof result === "object") {
    const date = (result as { date?: unknown }).date;
    return typeof date === "string" ? [date] : [];
  }
  return [];
}

export const invoicesProfilePolicy: PluginProfilePolicy = (input) => {
  if (
    hasProfile(input, "contacts_with_invoices_viewer") &&
    input.moduleId === "invoices" &&
    isWriteOperation(input)
  ) {
    return deny("profile contacts_with_invoices_viewer is read-only");
  }

  if (!hasProfile(input, "invoices_current_year_reader")) {
    return null;
  }

  if (input.moduleId !== "invoices") {
    return deny(
      "profile invoices_current_year_reader limited to invoices module"
    );
  }

  if (isWriteOperation(input)) {
    return deny("profile invoices_current_year_reader cannot write invoices");
  }

  if (!(input.input && typeof input.input === "object")) {
    return null;
  }

  const record = input.input as Record<string, unknown>;
  const query =
    record.query && typeof record.query === "object"
      ? (record.query as Record<string, unknown>)
      : {};
  const body =
    record.body && typeof record.body === "object"
      ? (record.body as Record<string, unknown>)
      : {};

  const directYear =
    typeof record.year === "number"
      ? record.year
      : typeof query.year === "number"
        ? query.year
        : typeof body.year === "number"
          ? body.year
          : null;
  const fromYear = extractYear(record.from ?? query.from ?? body.from);
  const toYear = extractYear(record.to ?? query.to ?? body.to);
  const expectedYear = getCurrentYear();

  if (directYear !== null && directYear !== expectedYear) {
    return deny("invoice access restricted to current year");
  }
  if (fromYear !== null && fromYear !== expectedYear) {
    return deny("invoice access restricted to current year");
  }
  if (toYear !== null && toYear !== expectedYear) {
    return deny("invoice access restricted to current year");
  }

  return null;
};

export const invoicesResultPolicy: PluginResultPolicy = (input, result) => {
  if (
    input.moduleId !== "invoices" ||
    !hasProfile(input, "invoices_current_year_reader") ||
    isWriteOperation(input)
  ) {
    return null;
  }

  const expectedYear = getCurrentYear();
  const invalid = collectInvoiceDates(result).some(
    (date) => extractYear(date) !== expectedYear
  );

  return invalid ? deny("invoice access restricted to current year") : null;
};
