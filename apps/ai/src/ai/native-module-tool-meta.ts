import type { MastraToolDefinition } from "@engenty/ai-core";

/** Metadata the space gate needs on a directly-attached catalog tool. */
export const NATIVE_MODULE_TOOL_META = Symbol.for(
  "engenty.nativeModuleToolMeta"
);

export interface NativeModuleToolMeta {
  moduleId?: string;
  operationId: string;
  readOnly: boolean;
}

export type NativeModuleTool = MastraToolDefinition & {
  [NATIVE_MODULE_TOOL_META]?: NativeModuleToolMeta;
};

export function nativeModuleToolMeta(
  tool: MastraToolDefinition | undefined
): NativeModuleToolMeta | undefined {
  if (!tool || typeof tool !== "object") {
    return;
  }
  return (tool as NativeModuleTool)[NATIVE_MODULE_TOOL_META];
}

export function withNativeModuleToolMeta(
  tool: MastraToolDefinition,
  meta: NativeModuleToolMeta
): MastraToolDefinition {
  const tagged = tool as NativeModuleTool;
  tagged[NATIVE_MODULE_TOOL_META] = meta;
  return tagged;
}
