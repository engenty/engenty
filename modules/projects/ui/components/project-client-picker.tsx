import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { useMemo, useState } from "react";
import { getContactsPluginApi } from "../plugins.js";
import { useProjectEntitySearchQuery } from "../queries.js";

export interface ProjectClientSelection {
  client_id: string | null;
  client_name: string | null;
}

interface ProjectClientPickerProps {
  className?: string;
  clientId: string | null;
  clientName: string | null;
  disabled?: boolean;
  onChange: (next: ProjectClientSelection) => void;
  /** Rendered as the popover trigger. Defaults to a form-field style button. */
  trigger?: React.ReactNode;
}

/**
 * Search-and-pick the project's client from contacts. Shared by the inline
 * client block on the project page and the project settings panel, so both
 * write the same `client_id` / `client_name` pair.
 *
 * Renders nothing when the contacts module is not installed — there is no
 * catalog to pick from.
 */
export function ProjectClientPicker({
  className,
  clientId,
  clientName,
  disabled = false,
  onChange,
  trigger,
}: ProjectClientPickerProps) {
  const { t } = useTranslation("projects");
  const contactsPlugin = useMemo(() => getContactsPluginApi(), []);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: options = [], isLoading } = useProjectEntitySearchQuery(
    contactsPlugin,
    search,
    open
  );

  if (!contactsPlugin) {
    return null;
  }

  const label = clientName || clientId || t("create.clientOptional");

  const select = (next: ProjectClientSelection) => {
    setOpen(false);
    setSearch("");
    onChange(next);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            className={cn(
              "flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50",
              !(clientId || clientName) && "text-muted-foreground",
              className
            )}
            disabled={disabled}
            type="button"
          >
            <span className="truncate">{label}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) p-0">
        <div className="p-1">
          <Input
            autoFocus
            className="h-8"
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={t("create.searchClientPlaceholder")}
            value={search}
          />
        </div>
        <div className="max-h-[220px] overflow-auto">
          <button
            className="w-full px-2 py-2 text-left text-muted-foreground text-sm hover:bg-accent"
            onClick={() => select({ client_id: null, client_name: null })}
            type="button"
          >
            {t("create.noClient")}
          </button>
          {isLoading && (
            <div className="px-2 py-2 text-muted-foreground text-sm">
              {t("create.loadingContacts")}
            </div>
          )}
          {!isLoading &&
            options
              .filter((entity) => entity.id)
              .map((entity) => (
                <button
                  className="w-full px-2 py-2 text-left text-sm hover:bg-accent"
                  key={entity.id}
                  onClick={() =>
                    select({
                      client_id: entity.id,
                      client_name: entity.display_name,
                    })
                  }
                  type="button"
                >
                  {entity.display_name}
                </button>
              ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
