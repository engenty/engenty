import { requestApiJson } from "@engenty/api-client";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/** A file already in file storage that the wizard should open with. */
export interface InitialImportFile {
  filename: string;
  storageKey: string;
}

/** `tenants/<t>/chat/<thread>/<ts>_<name>` → `<name>`. */
export function filenameFromStorageKey(storageKey: string): string {
  const last = storageKey.split("/").pop() ?? storageKey;
  return last.replace(/^\d+_/, "") || last;
}

/**
 * The file a page was opened with: `?file=<storage_key>&name=<filename>`.
 * An agent that received the CSV in chat opens the import page this way, so
 * the person lands on the mapping step instead of uploading the file again.
 * Reads the router's location, which in the View Pane is the pane's own.
 */
export function useInitialImportFile(): InitialImportFile | null {
  const [params] = useSearchParams();
  const storageKey = params.get("file")?.trim() ?? "";
  const name = params.get("name")?.trim() ?? "";
  return useMemo(
    () =>
      storageKey
        ? {
            filename: name || filenameFromStorageKey(storageKey),
            storageKey,
          }
        : null,
    [name, storageKey]
  );
}

/** The file's text, through a short-lived signed read URL (tenant-checked by core). */
export async function fetchImportFileText(storageKey: string): Promise<string> {
  const { url } = await requestApiJson<{ url: string }>(
    `/api/file-storage/files/url?${new URLSearchParams({ key: storageKey }).toString()}`,
    { method: "GET" }
  );
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load the file (${response.status}).`);
  }
  return response.text();
}
