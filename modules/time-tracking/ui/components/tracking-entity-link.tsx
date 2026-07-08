import { Link2 } from "lucide-react";
import { Link } from "react-router-dom";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLinkableEntityId(
  id: string | null | undefined
): id is string {
  return typeof id === "string" && UUID_PATTERN.test(id);
}

export function projectDetailPath(projectId: string) {
  return `/mdl/projects/${encodeURIComponent(projectId)}`;
}

export function taskDetailPath(taskId: string) {
  return `/mdl/tasks/${encodeURIComponent(taskId)}`;
}

interface TrackingEntityLinkProps {
  ariaLabel: string;
  href: string;
}

export function TrackingEntityLink({
  ariaLabel,
  href,
}: TrackingEntityLinkProps) {
  return (
    <Link
      aria-label={ariaLabel}
      className="inline-flex shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      to={href}
    >
      <Link2 className="size-3.5" />
    </Link>
  );
}
