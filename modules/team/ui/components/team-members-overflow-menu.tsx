import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListToolbarIconButton,
} from "@engenty/ui-core";
import { MoreVertical, Settings, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TEAM_IMPORT_PATH, TEAM_MODULE_SETTINGS_PATH } from "../team-paths.js";

export interface TeamMembersOverflowMenuProps {
  importLabel: string;
  menuMoreLabel: string;
  settingsLabel: string;
}

export function TeamMembersOverflowMenu({
  importLabel,
  menuMoreLabel,
  settingsLabel,
}: TeamMembersOverflowMenuProps) {
  const navigate = useNavigate();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ListToolbarIconButton aria-label={menuMoreLabel} type="button">
          <MoreVertical />
        </ListToolbarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuItem onClick={() => navigate(TEAM_IMPORT_PATH)}>
          <Upload className="mr-2 h-4 w-4" />
          {importLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(TEAM_MODULE_SETTINGS_PATH)}>
          <Settings className="mr-2 h-4 w-4" />
          {settingsLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
