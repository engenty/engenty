export declare const DEFAULT_SUPABASE_PROJECT_ID: string;
export declare function projectIdError(projectId: string): string | null;
export declare function configuredPorts(content: string): number[];
export declare function parseProjectId(content: string): string | null;
export declare function detectPortOffset(
  content: string,
  templateContent: string
): number;
export declare function applyProjectId(
  content: string,
  projectId: string
): string;
export declare function shiftLocalPorts(
  content: string,
  offset: number
): string;
export declare function applyLocalStackIdentity(
  content: string,
  params: { projectId: string; portOffset?: number }
): string;
export declare function localStackIdentityFromEnv(env: NodeJS.ProcessEnv): {
  portOffset: number;
  projectId: string;
};
export declare function materializeSupabaseConfig(
  root: string,
  refresh: boolean,
  env?: NodeJS.ProcessEnv
): string | false;
