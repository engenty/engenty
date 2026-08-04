import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";

interface FilesListPreviewItem {
  filename: string;
  key: string;
  mime_type?: string;
}

export function useFilesListAgentUiSlice(input: {
  bucket: string;
  files: FilesListPreviewItem[];
  prefix: string;
  search: string;
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const preview = input.files.slice(0, 10).map((f) => ({
      id: f.key,
      label: f.filename?.trim() || f.key,
    }));
    const filters: Record<string, string> = { bucket: input.bucket };
    if (input.prefix) {
      filters.prefix = input.prefix;
    }
    const location = input.prefix
      ? ` in "${input.prefix}"`
      : ` in bucket "${input.bucket}"`;
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Files",
          page_description: q
            ? `Files list${location} filtered by search (${input.files.length} visible).`
            : `Files list${location} (${input.files.length} visible).`,
          list_search: q,
          list_filters: filters,
          list_total: input.files.length,
          list_preview: preview,
        }),
      },
    };
  }, [input.bucket, input.files, input.prefix, input.search]);

  useRegisterAgentUiSlice("files.list", slice);
}

export function useFilesDetailAgentUiSlice(input: {
  fileKey: string;
  filename: string;
}) {
  const slice = useMemo(() => {
    if (!input.fileKey) {
      return null;
    }
    const name = input.filename?.trim() || input.fileKey;
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: name,
          page_description: `Viewing file "${name}".`,
        }),
        file_key: input.fileKey,
        file_name: name,
      },
      selection: {
        entity_id: input.fileKey,
        entity_type: "file",
      },
    };
  }, [input.fileKey, input.filename]);

  useRegisterAgentUiSlice("files.detail", slice);
}

/** Preview brief: path + name only — never file contents. */
export function useFilesPreviewAgentUiSlice(input: {
  fileKey: string;
  filename: string;
}) {
  const slice = useMemo(() => {
    if (!input.fileKey) {
      return null;
    }
    const name = input.filename?.trim() || input.fileKey;
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "preview",
          page_title: name,
          page_description: `Previewing file "${name}" at path ${input.fileKey}.`,
        }),
        file_key: input.fileKey,
        file_name: name,
      },
      selection: {
        entity_id: input.fileKey,
        entity_type: "file",
      },
    };
  }, [input.fileKey, input.filename]);

  useRegisterAgentUiSlice("files.preview", slice);
}
