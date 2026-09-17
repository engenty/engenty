#!/usr/bin/env node
/**
 * MCP operation inventory guard. The live coverage report is produced by
 * apps/core inventoryMcpOperations() (see inventory.test.ts). This script
 * fails if the plugin-sdk MCP disposition contract is removed so “all
 * operations” cannot silently become ungoverned again.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = fs.readFileSync(
  path.join(root, "packages/plugin-sdk/src/mcp-disposition.ts"),
  "utf8"
);
const meta = fs.readFileSync(
  path.join(root, "packages/plugin-sdk/src/index.ts"),
  "utf8"
);

const required = [
  "MCP_DISPOSITIONS = [",
  '"default"',
  '"explicit_grant"',
  '"never"',
  "mcpDisposition?:",
];

const missing = required.filter(
  (needle) => !(sdk.includes(needle) || meta.includes(needle))
);
if (missing.length > 0) {
  console.error(
    `check-mcp-operation-inventory: missing MCP contract pieces:\n${missing.join("\n")}`
  );
  process.exit(1);
}
console.log(
  "check-mcp-operation-inventory: MCP disposition contract is present. Runtime coverage lives in apps/core inventory tests."
);
