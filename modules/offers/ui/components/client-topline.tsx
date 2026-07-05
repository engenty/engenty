import { FolderInput, Link as LinkIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ClientToplineProps {
  clientId?: string | null;
  clientName?: string;
  isReadOnly?: boolean;
  onChangeClient?: () => void;
  showChangeClient?: boolean;
  showLinkToClient?: boolean;
}

export function ClientTopline({
  clientName,
  clientId,
  showChangeClient = false,
  showLinkToClient = true,
  onChangeClient,
  isReadOnly = false,
}: ClientToplineProps) {
  const navigate = useNavigate();

  if (!clientName) {
    return null;
  }

  const handleLinkToClient = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clientId) {
      navigate(`/mdl/contacts/${clientId}`);
    }
  };

  const handleChangeClient = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeClient?.();
  };

  const showActions =
    (showChangeClient && !isReadOnly) || (showLinkToClient && clientId);

  return (
    <div className="group/client relative inline-flex items-center gap-2">
      <div className="text-muted-foreground text-xs sm:text-sm">
        {clientName}
      </div>
      {showActions && (
        <div className="ml-2 flex items-center gap-3">
          {showChangeClient && !isReadOnly && (
            <FolderInput
              className="h-3.5 w-3.5 cursor-pointer text-foreground opacity-0 transition-opacity hover:text-foreground/80 group-hover/client:opacity-100"
              onClick={handleChangeClient}
            />
          )}
          {showLinkToClient && clientId && (
            <LinkIcon
              className="h-3.5 w-3.5 cursor-pointer text-foreground opacity-0 transition-opacity hover:text-foreground/80 group-hover/client:opacity-100"
              onClick={handleLinkToClient}
            />
          )}
        </div>
      )}
    </div>
  );
}
