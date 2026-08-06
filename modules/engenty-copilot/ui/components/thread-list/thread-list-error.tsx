import { Button } from "@engenty/ui-core";
import { CircleAlert } from "lucide-react";

interface ThreadListErrorProps {
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  title: string;
}

export function ThreadListError(props: ThreadListErrorProps) {
  return (
    <div
      className="mx-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-3"
      role="alert"
    >
      <div className="flex gap-2">
        <CircleAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-destructive"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="font-medium text-destructive text-xs">
              {props.title}
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {props.description}
            </p>
          </div>
          {props.onRetry && props.retryLabel ? (
            <Button
              className="h-7 px-2 text-xs"
              onClick={props.onRetry}
              size="sm"
              type="button"
              variant="outline"
            >
              {props.retryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
