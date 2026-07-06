import { registerConnectorModule } from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { s3Connector } from "./s3.js";

/**
 * S3 connector module: read-only access to S3-compatible buckets via the
 * api_key auth kind (credentials form; no per-deployment env vars). The whole
 * agent surface is the synthesized `s3_files_*` read actions.
 */
const registerConnectionsS3Plugin: EngentyPluginFactory = (engenty) => {
  registerConnectorModule(engenty, s3Connector);
};

export default registerConnectionsS3Plugin;
