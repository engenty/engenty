import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";

export interface Profile {
  avatar_url?: string | null;
  full_name: string;
  id: string;
  is_connected?: boolean;
}

interface AvatarStackProps {
  max?: number;
  profiles: Profile[];
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-10 w-10 text-base",
  xl: "h-12 w-12 text-base",
};

export const AvatarStack = ({
  profiles,
  max = 3,
  size = "sm",
}: AvatarStackProps) => {
  const displayProfiles = profiles.slice(0, max);
  const remainingCount = profiles.length - max;

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  if (profiles.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex -space-x-2">
        {displayProfiles.map((profile) => (
          <Tooltip key={profile.id}>
            <TooltipTrigger asChild>
              <Avatar
                className={`${sizeClasses[size]} border-2 border-background`}
              >
                {profile.avatar_url && (
                  <AvatarImage
                    alt={profile.full_name}
                    src={profile.avatar_url}
                  />
                )}
                <AvatarFallback
                  className={
                    profile.is_connected === false
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground"
                  }
                >
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>{profile.full_name}</p>
            </TooltipContent>
          </Tooltip>
        ))}
        {remainingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar
                className={`${sizeClasses[size]} border-2 border-background`}
              >
                <AvatarFallback className="bg-muted text-muted-foreground">
                  +{remainingCount}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                {profiles.slice(max).map((profile) => (
                  <p key={profile.id}>{profile.full_name}</p>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};
