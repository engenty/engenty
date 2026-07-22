import { ENGENTY_CSV_TOOL_IDS } from "@engenty/engenty-copilot/ai";

/** File-analyst surface: vault IO + structured analyze + CSV cleanup. */
export const ENGENTY_FILE_ANALYST_TOOL_IDS: string[] = [
  "vault_download_file",
  "vault_get_file_url",
  "vault_list_files",
  "analyze_file",
  ...ENGENTY_CSV_TOOL_IDS,
];
