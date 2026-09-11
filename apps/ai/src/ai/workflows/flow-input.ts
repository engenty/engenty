// Input a flow needs but the caller never sends.
//
// The graph's own inputSchema rejects it at `run.start()` — inside the
// background run, so the caller has already been told "queued" and only a
// poll reveals the failure. Checked up front instead: the press, the tool and
// the routine writer all learn it synchronously, and no failed run row is
// created for a call that could never have worked.
import { jsonSchemaToZod } from "@mastra/core/workflows";

/** Required input properties the caller does not supply; a `default` counts. */
export function missingRequiredFlowInputs(
  inputSchema: Record<string, unknown> | null | undefined,
  input: Record<string, unknown> | null | undefined
): string[] {
  const rawRequired = inputSchema?.required;
  const required = Array.isArray(rawRequired) ? rawRequired : [];
  const properties = (inputSchema?.properties ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const supplied = input ?? {};
  return required
    .filter((name): name is string => typeof name === "string")
    .filter((name) => {
      if (name in supplied) {
        return false;
      }
      const property = properties[name];
      return !(property && "default" in property);
    });
}

export class FlowInputMissingError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `The Action requires input this call did not supply: ${missing.join(", ")}.`
    );
    this.missing = missing;
    this.name = "FlowInputMissingError";
  }
}

export class FlowInputShapeError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      `The Action's input does not match its schema: ${issues.join("; ")}.`
    );
    this.issues = issues;
    this.name = "FlowInputShapeError";
  }
}

export function assertFlowInput(
  inputSchema: Record<string, unknown> | null | undefined,
  input: Record<string, unknown> | null | undefined
): void {
  const missing = missingRequiredFlowInputs(inputSchema, input);
  if (missing.length > 0) {
    throw new FlowInputMissingError(missing);
  }
  // Shape after presence: "you forgot contact_id" beats "contact_id: Required"
  // buried in a zod issue list, so the missing-check keeps its own error.
  if (!inputSchema || Object.keys(inputSchema.properties ?? {}).length === 0) {
    return;
  }
  const checked = jsonSchemaToZod(inputSchema).safeParse(input ?? {});
  if (!checked.success) {
    throw new FlowInputShapeError(
      checked.error.issues.map(
        (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`
      )
    );
  }
}
