/**
 * Slice ids for what the copilot is told about this pane.
 *
 * Three, not one: the node and the file are different branches that never mount
 * together, and a file's BYTES arrive a level below the row that names them —
 * so the file's identity is published the moment it opens and its text joins
 * when (and if) the download lands.
 */
import { useUiContributions } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";

export const SPACE_DATA_NODE_SLICE_ID = "space-data:node";
export const SPACE_DATA_FILE_SLICE_ID = "space-data:file";
export const SPACE_DATA_FILE_TEXT_SLICE_ID = "space-data:file-text";
export const SPACE_DATA_ARTIFACT_SLICE_ID = "space-data:artifact";

/**
 * The surface for one record or bundle, keyed by its node TYPE.
 *
 * Kind is the wrong key here and `page` was the exception that hid it: `page`
 * is produced by exactly one store, but `record` and `bundle` are produced by
 * EVERY data adapter, so `spaces.data.record` would let the contacts module
 * render an offer. The node type is already namespaced by its module
 * (`contacts.contact`, `offers.offer`) and is already on the document the pane
 * reads, so it is the key that cannot collide.
 */
export function spaceDataNodeSurface(nodeType: string): string {
  return `spaces.data.node:${nodeType}`;
}

/**
 * The surface for a FOLDER, keyed by the type its adapter declared.
 *
 * Keyed like a node and for the same reason: `People` and `sent` are folders
 * of different modules, and one shared `spaces.data.folder` would let contacts
 * render the offer pipeline. A folder without a declared type has no surface
 * and gets the generic folder overview — which is the honest default, since a
 * folder nobody claimed is exactly a list of what is in it.
 */
export function spaceDataFolderSurface(nodeType: string): string {
  return `spaces.data.folder:${nodeType}`;
}

/**
 * The module-contributed view for a node, if any module contributed one.
 *
 * The FIRST contribution wins rather than all of them stacking: this is one
 * node, and two renderers for it would be two answers to the same question.
 */
export function useSpaceDataSurfaceView(surface: string | null | undefined) {
  const { contributions } = useUiContributions();
  return useMemo(() => {
    if (!surface) {
      return null;
    }
    const [tab] = contributions.tabs
      .filter((entry) => entry.surface === surface)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return tab?.component ?? null;
  }, [contributions.tabs, surface]);
}
