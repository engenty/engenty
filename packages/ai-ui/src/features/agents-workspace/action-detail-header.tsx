import { EditableText } from "@engenty/ui-core";

interface ActionDetailHeaderProps {
  actionKey: string;
  description: string;
  descriptionFallback: string;
  descriptionPlaceholder: string;
  headerStatusLine: string;
  isEditing: boolean;
  moduleLabel: string;
  name: string;
  onDescriptionChange: (value: string) => void;
  onNameChange: (value: string) => void;
  statusFallbackName: string;
}

export function ActionDetailHeader({
  actionKey,
  description,
  descriptionFallback,
  descriptionPlaceholder,
  headerStatusLine,
  isEditing,
  moduleLabel,
  name,
  onDescriptionChange,
  onNameChange,
  statusFallbackName,
}: ActionDetailHeaderProps) {
  return (
    <div className="mb-2">
      <p className="text-sm">
        <span className="font-medium text-foreground">
          {actionKey || statusFallbackName}
        </span>
        <span className="mx-1.5 text-muted-foreground">·</span>
        <span className="text-muted-foreground">{moduleLabel}</span>
      </p>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <EditableText
          as="h1"
          className={[
            "min-w-0 flex-1 px-0 font-semibold text-2xl text-foreground leading-8 tracking-tight",
            isEditing ? "rounded-md" : "",
          ].join(" ")}
          isPreview={!isEditing}
          onSave={onNameChange}
          onUpdate={onNameChange}
          placeholder={statusFallbackName}
          value={name || statusFallbackName}
          variant={isEditing ? "filled" : "plain"}
        />
        {headerStatusLine ? (
          <p className="max-w-xs shrink-0 text-right text-muted-foreground text-sm">
            {headerStatusLine}
          </p>
        ) : null}
      </div>
      <EditableText
        as="div"
        className={[
          "mt-2 min-h-20 max-w-4xl px-0 pb-4 text-muted-foreground text-sm",
          isEditing ? "rounded-md" : "",
        ].join(" ")}
        isPreview={!isEditing}
        onEnter={() => {}}
        onSave={onDescriptionChange}
        onUpdate={onDescriptionChange}
        placeholder={descriptionPlaceholder}
        value={isEditing ? description : description || descriptionFallback}
        variant={isEditing ? "filled" : "plain"}
      />
    </div>
  );
}
