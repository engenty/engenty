import {
  cancel,
  isCancel,
  MULTISELECT_INSTRUCTIONS,
  multiselect,
  outro,
} from "@clack/prompts";

export interface SelectLoopOption {
  hint?: string;
  label: string;
  value: string;
}

export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// clack's multiselect natively binds `a` (toggle all/none) and `i` (invert) but
// doesn't list them in the footer. Advertise them once so the bulk actions are
// discoverable in the bottom action bar.
function ensureBulkKeysAdvertised(): void {
  if (MULTISELECT_INSTRUCTIONS.some((s) => s.includes("all/none"))) {
    return;
  }
  const enterIdx = MULTISELECT_INSTRUCTIONS.findIndex((s) =>
    s.includes("confirm")
  );
  const at = enterIdx >= 0 ? enterIdx : MULTISELECT_INSTRUCTIONS.length;
  MULTISELECT_INSTRUCTIONS.splice(at, 0, "a: all/none", "i: invert");
}

/**
 * Shared checkbox picker: a single list with the bulk actions surfaced as
 * footer keys — `a` toggles all/none, `i` inverts, space toggles one, enter
 * confirms. Used by every plugin picker so the UX is identical whether the
 * source is the API or the on-disk manifest.
 */
export async function runMultiSelectLoop(params: {
  doneVerb: string;
  options: SelectLoopOption[];
  preselect?: string[];
  title: string;
}): Promise<string[] | "cancelled"> {
  ensureBulkKeysAdvertised();

  const allValues = new Set(params.options.map((o) => o.value));
  const initialValues = (params.preselect ?? []).filter((v) =>
    allValues.has(v)
  );

  const picked = await multiselect({
    message: params.title,
    options: params.options,
    initialValues,
    required: false,
  });
  if (isCancel(picked)) {
    cancel("Cancelled.");
    return "cancelled";
  }

  const selected = (picked as string[]).slice().sort();
  outro(`${selected.length} plugin(s) · ${params.doneVerb}`);
  return selected;
}
