import { SidebarRowTitleMarquee } from "@engenty/ui-core";
import { useEffect, useRef } from "react";

export function DriveRowTitle({
  editing,
  endGutterPx = 0,
  name,
  onCancel,
  onCommit,
}: {
  editing: boolean;
  /** Keep a scrolling title clear of a trailing overlay control. */
  endGutterPx?: number;
  name: string;
  onCancel: () => void;
  onCommit: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      return;
    }
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }, [editing]);

  if (!editing) {
    return <SidebarRowTitleMarquee endGutterPx={endGutterPx} text={name} />;
  }

  return (
    <input
      className="h-6 min-w-0 flex-1 rounded-sm border border-input bg-background px-1 text-sm outline-none ring-1 ring-ring"
      defaultValue={name}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(event.currentTarget.value);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      ref={inputRef}
    />
  );
}
