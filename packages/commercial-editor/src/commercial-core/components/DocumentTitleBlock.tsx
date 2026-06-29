import { useState } from "react";
import { EditableText } from "../shared/EditableText";

interface DocumentTitleBlockProps {
  isReadOnly?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

/**
 * Shared document title (h1) for offer/invoice card body.
 * Display mode: click to edit. Edit mode: EditableText with onSave.
 */
export const DocumentTitleBlock = ({
  value,
  onChange,
  placeholder = "Title",
  isReadOnly = false,
}: DocumentTitleBlockProps) => {
  const [isEditing, setIsEditing] = useState(false);

  const showDisplay = isReadOnly || !isEditing;

  if (showDisplay) {
    const headingClass = "font-bold text-3xl text-foreground";
    return (
      <div className="mb-8">
        {isReadOnly ? (
          <h1 className={headingClass}>{value}</h1>
        ) : (
          <h1 className={headingClass}>
            <button
              className="w-full cursor-pointer text-left transition-colors hover:bg-input/30"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsEditing(true);
              }}
              type="button"
            >
              {value}
            </button>
          </h1>
        )}
      </div>
    );
  }

  return (
    <div className="mb-8">
      <EditableText
        as="h1"
        autoFocus
        className="font-bold text-3xl text-foreground"
        onSave={(text) => {
          onChange(text);
          setIsEditing(false);
        }}
        onUpdate={onChange}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
};
