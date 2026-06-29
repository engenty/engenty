import { dim, green, red, yellow } from "../env-setup/env-style.js";

/** Contract fields the CLI renders (subset of OperationContract). */
export interface ToolContractView {
  auth: {
    requiredCapabilities: string[];
    requiresApproval: boolean;
    riskLevel: "low" | "medium" | "high" | "critical";
  };
  moduleId: string;
  operationId: string;
  readOnly: boolean;
  summary?: string;
}

const RISK_PAINT: Record<string, (text: string) => string> = {
  critical: red,
  high: red,
  low: green,
  medium: yellow,
};

function paintRisk(risk: string, padded: string): string {
  return (RISK_PAINT[risk] ?? ((text: string) => text))(padded);
}

export function renderContractsTable(contracts: ToolContractView[]): string {
  if (contracts.length === 0) {
    return "No tools available for this principal.";
  }
  const rows = contracts.map((contract) => [
    contract.operationId,
    contract.moduleId,
    contract.auth.riskLevel,
    contract.auth.requiresApproval ? "yes" : "",
    contract.readOnly ? "ro" : "rw",
    contract.summary ?? "",
  ]);
  const header = ["TOOL", "MODULE", "RISK", "APPROVAL", "RW", "SUMMARY"];
  const all = [header, ...rows];
  const widths = header.map((_, index) =>
    Math.max(...all.map((row) => row[index]?.length ?? 0))
  );
  const lines = all.map((row, rowIndex) =>
    row
      .map((cell, index) => {
        const padded = cell.padEnd(widths[index]);
        if (rowIndex === 0) {
          return dim(padded);
        }
        if (index === 2) {
          return paintRisk(cell, padded);
        }
        return index === 5 ? dim(padded) : padded;
      })
      .join("  ")
      .trimEnd()
  );
  return lines.join("\n");
}
