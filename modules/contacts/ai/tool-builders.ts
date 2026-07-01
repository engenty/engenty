import type { ToolExecutionContext } from "@engenty/ai-core";
import {
  buildEngentyApiCatalogTool,
  buildEngentyApiTool,
  ENGENTY_API_REQUEST_SCOPE_KEY,
  webSearchTool,
} from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { buildCreateContactTool } from "./tools/create-contact/create-contact-tool.js";
import { buildCreateContactRelationTool } from "./tools/create-contact-relation/create-contact-relation-tool.js";
import { buildExtractContactFromEmailTool } from "./tools/extract-contact-from-email/extract-contact-from-email-tool.js";
import { buildLoadContactTool } from "./tools/load-contact/load-contact-tool.js";

export type ContactsToolBuilder = (
  ctx: ToolExecutionContext,
  invokeContactsOperation: PluginServerGatewayCaller["invokeOperation"]
) => Record<string, object> | null;

export const CONTACTS_TOOL_BUILDERS: Record<string, ContactsToolBuilder> = {
  engentyApi: (ctx, _invokeContactsOperation) => {
    const requestFn = ctx.scope?.[ENGENTY_API_REQUEST_SCOPE_KEY];
    if (typeof requestFn !== "function") {
      return null;
    }
    return {
      engentyApi: buildEngentyApiTool({
        request: requestFn as (pathAndSearch: string) => Promise<unknown>,
      }) as object,
    };
  },
  engentyApiCatalog: (ctx, _invokeContactsOperation) => ({
    engentyApiCatalog: buildEngentyApiCatalogTool(ctx) as object,
  }),
  createContact: (_ctx, invokeContactsOperation) => ({
    createContact: buildCreateContactTool(invokeContactsOperation) as object,
  }),
  createContactRelation: (_ctx, invokeContactsOperation) => ({
    createContactRelation: buildCreateContactRelationTool(
      invokeContactsOperation
    ) as object,
  }),
  extractContactFromEmail: (_ctx, invokeContactsOperation) => ({
    extractContactFromEmail: buildExtractContactFromEmailTool(
      invokeContactsOperation
    ) as object,
  }),
  loadContact: (ctx, invokeContactsOperation) => ({
    loadContact: buildLoadContactTool(invokeContactsOperation, ctx) as object,
  }),
  web_search: (_ctx, _invokeContactsOperation) => ({
    web_search: webSearchTool,
  }),
};
