import { getUiEnv } from "./env";

const env = getUiEnv();

export const config = {
  apiBaseUrl: env.apiBaseUrl,
  aiBaseUrl: env.aiBaseUrl,
};
