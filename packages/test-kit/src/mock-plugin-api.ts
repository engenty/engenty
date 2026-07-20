import type {
  PluginAiRegistration,
  PluginHttpRoute,
  PluginRegistrationReceipt,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { makeAuth } from "./identity.js";

/**
 * Shared fake `PluginServerApi` for module API registration tests.
 * Replaces the per-module copies: registrations are collected into arrays,
 * everything else is a no-op receipt. Override individual members (e.g.
 * `callGatewayMethod`) via the `overrides` argument.
 */
export function makeMockApi(overrides: Partial<PluginServerApi> = {}) {
  const httpRoutes: PluginHttpRoute[] = [];
  const serverOperations: PluginServerOperation[] = [];
  const aiRegistrations: PluginAiRegistration[] = [];
  const noopReceipt = (): PluginRegistrationReceipt => ({
    dispose: () => {},
    id: "test-kit-receipt",
    kind: "test",
    pluginId: "test-kit",
    sourceInfo: {
      manifestId: "test-kit",
      manifestPath: "test-kit",
      pluginId: "test-kit",
      registrationKind: "test",
      rootDir: ".",
      source: "test-kit",
      sourceType: "module",
    },
  });

  const api: PluginServerApi = {
    callGatewayMethod: async () => null,
    hasOperation: () => false,
    registerAiRegistration: (registration) => {
      aiRegistrations.push(registration);
    },
    registerCli: () => {},
    registerFeatureFlags: () => [],
    registerHttpRoute: (route) => {
      httpRoutes.push(route);
      return noopReceipt();
    },
    registerOperation: (operation) => {
      serverOperations.push(operation);
      return noopReceipt();
    },
    registerProfilePolicy: () => {},
    registerResultPolicy: () => {},
    registerRoleProfiles: () => {},
    registerSearchIndexProvider: () => noopReceipt(),
    registerService: () => {},
    registerTestDataType: () => noopReceipt(),
    resolvePath: (relativePath: string) => relativePath,
    ...overrides,
  };

  return {
    aiRegistrations,
    api,
    defaultAuth: makeAuth(),
    httpRoutes,
    serverOperations,
  };
}
