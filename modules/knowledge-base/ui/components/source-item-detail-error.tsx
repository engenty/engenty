import { Button } from "@engenty/ui-core";
import { kbModulePageShellSectionClassName } from "../lib/kb-page-shell.js";

export function SourceItemDetailError({
  backLabel,
  errorMessage,
  onBack,
}: {
  backLabel: string | null;
  errorMessage: string;
  onBack: (() => void) | null;
}) {
  return (
    <section className={`${kbModulePageShellSectionClassName} gap-3`}>
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
        {errorMessage}
      </div>
      {backLabel && onBack ? (
        <Button onClick={onBack} type="button" variant="outline">
          {backLabel}
        </Button>
      ) : null}
    </section>
  );
}
