import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface FileInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Text shown when no file selected */
  emptyLabel?: string;
  onFileChange?: (file: File | null) => void;
  /** Button label to open file picker */
  selectLabel?: string;
  /** Optional class for the wrapper */
  wrapperClassName?: string;
}

const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  (
    {
      className,
      accept,
      disabled,
      emptyLabel = "No file selected",
      selectLabel = "Select file",
      onFileChange,
      onChange,
      wrapperClassName,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [fileName, setFileName] = React.useState<string | null>(null);

    const handleRef = (el: HTMLInputElement | null) => {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current =
        el;
      if (typeof ref === "function") {
        ref(el);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setFileName(file?.name ?? null);
      onFileChange?.(file);
      onChange?.(e);
    };

    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          wrapperClassName,
          className
        )}
      >
        <input
          accept={accept}
          aria-label={props["aria-label"] ?? "Choose file"}
          className="sr-only"
          disabled={disabled}
          onChange={handleChange}
          ref={handleRef}
          type="file"
          {...props}
        />
        <Button
          className="shrink-0"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          {selectLabel}
        </Button>
        <span className="min-w-0 truncate text-muted-foreground text-sm">
          {fileName ?? emptyLabel}
        </span>
      </div>
    );
  }
);
FileInput.displayName = "FileInput";

export { FileInput };
