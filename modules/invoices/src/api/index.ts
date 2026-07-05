import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { createInvoiceRepo } from "../dal/index.js";
import type { InvoicePdfStorageOrFactory } from "../dal/pdf-storage.js";
import { registerInvoicesGatewayMethods } from "./gateway-methods.js";
import { registerInvoicesHttpRoutes } from "./http-routes.js";

type InvoiceRepo = ReturnType<typeof createInvoiceRepo>;
type InvoiceRepoOrFactory =
  | InvoiceRepo
  | ((auth: PluginAuthContext) => InvoiceRepo);

function getRepo(
  repoOrFactory: InvoiceRepoOrFactory,
  auth?: PluginAuthContext
): InvoiceRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required for server-first repo");
    }
    return repoOrFactory(auth);
  }
  return repoOrFactory;
}

export function registerInvoicesApi(
  api: PluginServerApi,
  repoOrFactory: InvoiceRepoOrFactory,
  pdfStorageOrFactory: InvoicePdfStorageOrFactory
) {
  registerInvoicesHttpRoutes(api, repoOrFactory, getRepo, pdfStorageOrFactory);
  registerInvoicesGatewayMethods(api, repoOrFactory, getRepo);
}
