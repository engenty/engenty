import { registerConnectorModule } from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { githubConnector } from "./connector.js";

/**
 * GitHub connector module. The connections framework module owns the shared
 * machinery (schema, OAuth routes, policy gate, approvals); this module only
 * contributes the GitHub ConnectorDefinition, which projects one operation per
 * action (`github_repos_list`, `github_pr_create`, ...).
 */
const registerConnectionsGithubPlugin: EngentyPluginFactory = (engenty) => {
  registerConnectorModule(engenty, githubConnector);
};

export default registerConnectionsGithubPlugin;
