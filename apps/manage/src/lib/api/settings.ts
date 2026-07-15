import { request } from "./http";

export interface EnvVar {
  key: string;
  masked: boolean;
  /** Documented-but-unset optional key, shown so operators know it exists. */
  missing?: boolean;
  /** Masked in core when the key looks secret; empty when `missing`. */
  value: string;
}

export function getEnvVars(signal?: AbortSignal) {
  return request<{ vars: EnvVar[] }>("/api/settings/env", { signal }).then(
    (r) => r.vars
  );
}
