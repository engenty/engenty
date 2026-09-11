import { type ElementType, useEffect, useLayoutEffect, useRef } from "react";

export interface EditableTextProps {
  as?: ElementType;
  autoFocus?: boolean;
  autoSelect?: boolean;
  className?: string;
  disabled?: boolean;
  isPreview?: boolean;
  onEnter?: "blur" | "prevent" | ((e: React.KeyboardEvent) => void);
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPreviewClick?: () => void;
  onSave: (text: string) => void;
  onUpdate?: (text: string) => void;
  placeholder?: string;
  value: string;
  /** `filled` = always-on gray field. `hover` = gray only on hover (and when empty). `plain` = no surface. */
  variant?: "filled" | "hover" | "plain";
  [key: string]: unknown;
}

const FILLED_PREVIEW_CLASS =
  "cursor-pointer bg-input/30 outline-none ring-offset-0 transition-colors hover:bg-input/60 focus:ring-1 focus:ring-ring focus:ring-offset-0";
const FILLED_EDIT_CLASS =
  "cursor-text bg-input/30 outline-none ring-offset-0 transition-colors hover:bg-input/60 focus:bg-input/60 focus:ring-1 focus:ring-ring focus:ring-offset-0";
const HOVER_PREVIEW_CLASS =
  "cursor-pointer outline-none ring-offset-0 transition-colors empty:bg-input/30 hover:bg-input/30";
const HOVER_EDIT_CLASS =
  "cursor-text outline-none ring-offset-0 transition-colors empty:bg-input/30 hover:bg-input/30";
const PLAIN_PREVIEW_CLASS = "cursor-pointer outline-none";
const PLAIN_EDIT_CLASS = "cursor-text outline-none";

export function EditableText({
  as: Component = "div",
  value,
  placeholder,
  className = "",
  onSave,
  onUpdate,
  onKeyDown,
  autoFocus = false,
  autoSelect = true,
  onEnter = "blur",
  isPreview = false,
  onPreviewClick,
  disabled = false,
  variant = "filled",
  ...props
}: EditableTextProps) {
  const elementRef = useRef<HTMLElement | null>(null);
  const hasAutoFocusedRef = useRef(false);

  useLayoutEffect(() => {
    if (!elementRef.current || isPreview || disabled) {
      return;
    }
    if (document.activeElement !== elementRef.current) {
      elementRef.current.textContent = value || "";
    }
  }, [value, isPreview, disabled]);

  useEffect(() => {
    if (!autoFocus || hasAutoFocusedRef.current || isPreview || disabled) {
      return;
    }
    const element = elementRef.current;
    if (!element) {
      return;
    }
    element.focus();
    hasAutoFocusedRef.current = true;
    if (autoSelect && element.textContent) {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [autoFocus, autoSelect, isPreview, disabled]);

  const handleInput = (event: React.FormEvent<HTMLElement>) => {
    onUpdate?.(event.currentTarget.textContent || "");
  };

  const handleBlur = (event: React.FocusEvent<HTMLElement>) => {
    onSave(event.currentTarget.textContent || "");
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter") {
      if (onEnter === "blur") {
        event.preventDefault();
        event.currentTarget.blur();
      } else if (onEnter === "prevent") {
        event.preventDefault();
      } else if (typeof onEnter === "function") {
        onEnter(event);
      }
    }
    onKeyDown?.(event);
  };

  const previewClass =
    variant === "plain"
      ? PLAIN_PREVIEW_CLASS
      : variant === "hover"
        ? HOVER_PREVIEW_CLASS
        : FILLED_PREVIEW_CLASS;
  const editClass =
    variant === "plain"
      ? PLAIN_EDIT_CLASS
      : variant === "hover"
        ? HOVER_EDIT_CLASS
        : FILLED_EDIT_CLASS;

  if (isPreview || disabled) {
    return (
      <>
        <style>{`
          [data-placeholder]:empty:before {
            content: attr(data-placeholder);
            color: hsl(var(--muted-foreground));
            opacity: 0.5;
          }
        `}</style>
        <Component
          className={`${previewClass} ${className}`}
          data-placeholder={placeholder}
          onMouseDown={(event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
            onPreviewClick?.();
          }}
          {...props}
        >
          {value || (
            <span className="text-muted-foreground opacity-50">
              {placeholder}
            </span>
          )}
        </Component>
      </>
    );
  }

  return (
    <>
      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          opacity: 0.5;
        }
      `}</style>
      <Component
        className={`${editClass} ${className}`}
        contentEditable
        data-placeholder={placeholder}
        onBlur={handleBlur}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          if (
            elementRef.current &&
            document.activeElement !== elementRef.current
          ) {
            elementRef.current.focus();
            if (autoSelect) {
              const range = document.createRange();
              range.selectNodeContents(elementRef.current);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
            }
          }
          const onClick = props.onClick;
          if (typeof onClick === "function") {
            onClick(event);
          }
        }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        ref={(element: HTMLElement | null) => {
          elementRef.current = element;
          if (element && !isPreview && !disabled && element.textContent !== value) {
            element.textContent = value || "";
          }
        }}
        suppressContentEditableWarning
        {...props}
      />
    </>
  );
}
