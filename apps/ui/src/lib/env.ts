type UiImportMetaEnv = Record<string, string | undefined>;

function readEnv(): UiImportMetaEnv {
  return (import.meta as ImportMeta & { env?: UiImportMetaEnv }).env ?? {};
}

export function uiEnvString(key: string, fallback = ""): string {
  const env = readEnv();
  return env[key] ?? fallback;
}

export function getUiEnv() {
  return {
    apiBaseUrl: uiEnvString("VITE_API_BASE_URL", ""),
    aiBaseUrl: uiEnvString("VITE_ENGENTY_AI_BASE_URL", "").replace(/\/$/, ""),
  };
}
