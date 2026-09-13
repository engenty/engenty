export interface SchemaProbe {
  error?: string;
  exposed?: string[];
  missing?: string[];
  ok: boolean;
}

export interface SelfCheckProbe {
  checks?: Record<string, unknown>;
  error?: string;
  hookReady?: boolean;
  ok: boolean;
  rpcMissing?: boolean;
}

export function probeExposedSchemas(args: {
  anonKey: string;
  required?: string[];
  timeoutMs?: number;
  url: string;
}): Promise<SchemaProbe>;

export function probeDeploymentSelfCheck(args: {
  serviceRoleKey: string;
  timeoutMs?: number;
  url: string;
}): Promise<SelfCheckProbe>;
