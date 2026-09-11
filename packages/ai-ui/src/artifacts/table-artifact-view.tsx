import { useQueryClient } from "@engenty/query-client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtifactViewProps } from "./artifact-renderers.js";
import {
  artifactsQueryRoot,
  createArtifactVersion,
  resolveEngentyAiServiceBaseUrlSafe,
} from "./artifacts-api.js";
import {
  parseTableArtifactDocument,
  serializeTableArtifactDocument,
  type TableArtifactDocument,
} from "./table-artifact-document.js";
import { TableWorkspace } from "./table-workspace.js";
import type { TableWorkspaceRow } from "./table-workspace-model.js";

export function TableArtifactView({ artifact, content }: ArtifactViewProps) {
  const parsed = useMemo(
    () => (content ? parseTableArtifactDocument(content) : null),
    [content]
  );
  const [document, setDocument] = useState<TableArtifactDocument | null>(
    parsed
  );
  const [version, setVersion] = useState(artifact.current_version);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const lastSavedVersion = useRef(artifact.current_version);
  const artifactId = useRef(artifact.id);
  const documentRef = useRef<TableArtifactDocument | null>(parsed);
  const versionRef = useRef(artifact.current_version);

  useEffect(() => {
    if (artifact.id !== artifactId.current) {
      artifactId.current = artifact.id;
      setDocument(parsed);
      setVersion(artifact.current_version);
      lastSavedVersion.current = artifact.current_version;
      versionRef.current = artifact.current_version;
      setError(null);
      return;
    }
    if (parsed && artifact.current_version !== lastSavedVersion.current) {
      setDocument(parsed);
      setVersion(artifact.current_version);
    }
  }, [artifact.current_version, artifact.id, parsed]);

  if (!parsed) {
    return (
      <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-sm">
        {content ?? ""}
      </pre>
    );
  }

  const current = document ?? parsed;
  documentRef.current = current;
  versionRef.current = version;

  async function persist(next: TableArtifactDocument) {
    documentRef.current = next;
    setDocument(next);
    setPending(true);
    try {
      const saved = await createArtifactVersion({
        artifactId: artifact.id,
        content: serializeTableArtifactDocument(next),
        expectedVersion: versionRef.current,
        serviceBaseUrl: resolveEngentyAiServiceBaseUrlSafe(),
        summary: "Edited table",
      });
      lastSavedVersion.current = saved.artifact.current_version;
      versionRef.current = saved.artifact.current_version;
      setVersion(saved.artifact.current_version);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: artifactsQueryRoot });
    } catch (caught) {
      const status = (caught as { status?: number }).status;
      setError(
        status === 409
          ? "This table changed elsewhere. Reload to edit the latest version."
          : caught instanceof Error
            ? caught.message
            : "Could not save this table."
      );
      throw caught;
    } finally {
      setPending(false);
    }
  }

  function withRows(rows: TableWorkspaceRow[]): TableArtifactDocument {
    return { ...(documentRef.current ?? current), rows };
  }

  return (
    <TableWorkspace
      columns={current.columns}
      error={error}
      onDelete={async (rowId) => {
        const base = documentRef.current ?? parsed;
        await persist(withRows(base.rows.filter((row) => row.id !== rowId)));
      }}
      onInsert={async (values) => {
        const base = documentRef.current ?? parsed;
        await persist(
          withRows([
            ...base.rows,
            {
              cells: values,
              id: crypto.randomUUID(),
            },
          ])
        );
      }}
      onUpdate={async (rowId, values) => {
        const base = documentRef.current ?? parsed;
        await persist(
          withRows(
            base.rows.map((row) =>
              row.id === rowId
                ? { ...row, cells: { ...row.cells, ...values } }
                : row
            )
          )
        );
      }}
      pending={pending}
      rows={current.rows}
    />
  );
}
