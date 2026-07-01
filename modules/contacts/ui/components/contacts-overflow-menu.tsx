import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListToolbarIconButton,
} from "@engenty/ui-core";
import { MoreVertical, Settings, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface ContactsOverflowMenuProps {
  importLabel: string;
  menuMoreLabel: string;
  settingsLabel: string;
}

export function ContactsOverflowMenu({
  importLabel,
  menuMoreLabel,
  settingsLabel,
}: ContactsOverflowMenuProps) {
  const navigate = useNavigate();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ListToolbarIconButton aria-label={menuMoreLabel} type="button">
          <MoreVertical />
        </ListToolbarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate("/mdl/contacts/import")}>
          <Upload className="mr-2 h-4 w-4" />
          {importLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/mdl/contacts/settings")}>
          <Settings className="mr-2 h-4 w-4" />
          {settingsLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
