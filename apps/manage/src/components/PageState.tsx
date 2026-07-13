import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import type { ReactNode } from "react";

/**
 * Inline loading / error / empty states for list and detail bodies. Renders
 * `children` only when there is data and no error. Keeps every page's
 * async-state handling identical.
 */
export function PageState({
  isLoading,
  error,
  isEmpty,
  onRetry,
  children,
}: {
  children: ReactNode;
  error?: unknown;
  isEmpty?: boolean;
  isLoading?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation("common");

  if (isLoading) {
    return (
      <p className="p-page text-muted-foreground text-sm">
        {t("common.loading")}
      </p>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : t("common.error");
    return (
      <div className="space-y-3 p-page">
        <p className="text-destructive text-sm">{message}</p>
        {onRetry ? (
          <Button onClick={onRetry} size="sm" variant="outline">
            {t("common.retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <p className="p-page text-muted-foreground text-sm">
        {t("common.empty")}
      </p>
    );
  }

  return <>{children}</>;
}
