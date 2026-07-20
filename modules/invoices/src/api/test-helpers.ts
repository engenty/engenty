import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  PluginHttpRoute,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { makeMockApi as makeKitMockApi } from "@engenty/test-kit";

export function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `engenty-invoices-api-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function makeMockApi() {
  // Invoices-specific gateway stubs on top of the shared kit fake: the
  // invoice routes resolve customer data through the contacts module.
  const gatewayStubs = new Map<string, (input: unknown) => unknown>([
    [
      "contacts_get",
      (input) => {
        const id = (input as { id: string }).id;
        return {
          id,
          type: "organisation",
          display_name: "Acme GmbH",
          address_street: "Main 1",
          address_zip: "1010",
          address_city: "Vienna",
          address_country: "AT",
        };
      },
    ],
    ["contacts_add_contact_role", () => ({ ok: true })],
  ]);

  const kit = makeKitMockApi({
    callGatewayMethod: async (name, input) => {
      const handler = gatewayStubs.get(name);
      return handler ? handler(input) : null;
    },
  });
  kit.api.hasOperation = (operationId) =>
    kit.serverOperations.some((op) => op.operationId === operationId) ||
    gatewayStubs.has(operationId);

  return {
    api: kit.api,
    httpRoutes: kit.httpRoutes,
    serverOperations: kit.serverOperations,
  };
}

export function getRoute(
  routes: PluginHttpRoute[],
  method: PluginHttpRoute["method"],
  routePath: string
): PluginHttpRoute {
  const found = routes.find(
    (route) => route.method === method && route.path === routePath
  );
  if (!found) {
    throw new Error(`route not found: ${method.toUpperCase()} ${routePath}`);
  }
  return found;
}

export function getOperation(
  operations: PluginServerOperation[],
  operationId: string
): PluginServerOperation {
  const found = operations.find((op) => op.operationId === operationId);
  if (!found) {
    throw new Error(`operation not found: ${operationId}`);
  }
  return found;
}
