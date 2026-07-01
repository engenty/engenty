import type { PluginServerApi } from "@engenty/plugin-sdk";
import { registerTimeTrackingReadGatewayMethods } from "./read-ops.js";
import type {
  TimeTrackingGatewayDeps,
  TimeTrackingRepoOrFactory,
} from "./shared.js";
import { registerTimeTrackingWriteGatewayMethods } from "./write-ops.js";

export function registerTimeTrackingGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation" | "hasOperation">,
  repoOrFactory: TimeTrackingRepoOrFactory,
  deps: TimeTrackingGatewayDeps
) {
  registerTimeTrackingReadGatewayMethods(server, repoOrFactory, deps);
  registerTimeTrackingWriteGatewayMethods(server, repoOrFactory);
}
