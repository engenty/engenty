import {
  ENGENTY_SERVICE_ERROR_CODES,
  type EngentyServiceErrorCode,
} from "@engenty/api-contracts";
import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@engenty/ui-core";
import { AnimatedRefreshIcon } from "@engenty/ui-icons";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ServiceUnavailableNavigationState } from "../lib/initial-setup-gate";

export interface ServiceUnavailablePageProps {
  /** When embedded from a parent that already knows the failure (e.g. authenticated bootstrap). */
  initialState?: Partial<ServiceUnavailableNavigationState>;
}

const PRODUCTION_TITLE = "Service temporarily unavailable";
const PRODUCTION_BODY =
  "We can't load your workspace right now. Please try again in a moment. If this keeps happening, contact your administrator with the error code below.";

function devTitleFor(reason: ServiceUnavailableNavigationState["reason"]) {
  switch (reason) {
    case "database_unavailable":
      return "Database unreachable (dev)";
    case "api_unreachable":
      return "API unreachable (dev)";
    case "backend_error":
      return "Backend startup error (dev)";
  }
}

function defaultErrorCodeFor(
  reason: ServiceUnavailableNavigationState["reason"]
): EngentyServiceErrorCode {
  switch (reason) {
    case "database_unavailable":
      return ENGENTY_SERVICE_ERROR_CODES.DB_UNAVAILABLE;
    case "api_unreachable":
      return ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE;
    case "backend_error":
      return ENGENTY_SERVICE_ERROR_CODES.SETUP_BACKEND_ERROR;
  }
}

export function ServiceUnavailablePage({
  initialState,
}: ServiceUnavailablePageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isDev = isEngentyDevelopmentEnvironment();

  const state = useMemo((): ServiceUnavailableNavigationState => {
    const fromLocation = (location.state ??
      {}) as Partial<ServiceUnavailableNavigationState>;
    const merged = { ...initialState, ...fromLocation };
    const reason = merged.reason ?? "backend_error";
    const error_code = merged.error_code ?? defaultErrorCodeFor(reason);
    return {
      reason,
      error_code,
      message:
        merged.message ??
        // Dev-only fallback message; production UI never renders this.
        (reason === "database_unavailable"
          ? "Database appears unreachable from the API."
          : reason === "api_unreachable"
            ? "Browser could not reach the API host."
            : "Server returned an error while checking startup status."),
      ...(merged.api_base_url ? { api_base_url: merged.api_base_url } : {}),
      ...(merged.details ? { details: merged.details } : {}),
      ...(merged.http_status === undefined
        ? {}
        : { http_status: merged.http_status }),
    };
  }, [initialState, location.state]);

  const title = isDev ? devTitleFor(state.reason) : PRODUCTION_TITLE;

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4">
      <Card className="w-full max-w-lg shadow-md">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <p className="mt-2 text-muted-foreground text-sm">
              {PRODUCTION_BODY}
            </p>
            <p className="mt-3 font-mono text-muted-foreground text-xs tracking-wide">
              Error code: {state.error_code}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDev ? (
            <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs">
              <p className="font-medium text-foreground">Developer details</p>
              <p className="mt-1 break-all text-muted-foreground">
                {state.message}
              </p>
              {state.api_base_url ? (
                <p className="mt-2 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    API base URL:
                  </span>{" "}
                  <span className="break-all">{state.api_base_url}</span>
                </p>
              ) : null}
              {state.http_status === undefined ? null : (
                <p className="mt-1 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    HTTP status:
                  </span>{" "}
                  {state.http_status}
                </p>
              )}
              {state.details && Object.keys(state.details).length > 0 ? (
                <dl className="mt-2 space-y-1">
                  {Object.entries(state.details).map(([k, v]) => (
                    <div key={k}>
                      <dt className="font-medium text-foreground">{k}</dt>
                      <dd className="break-all text-muted-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className="mt-2 text-muted-foreground">
                Local tip: confirm Docker / Supabase is running and{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  VITE_API_BASE_URL
                </code>{" "}
                points at your core API.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void navigate(0);
              }}
              type="button"
              variant="default"
            >
              <AnimatedRefreshIcon className="mr-2" size="sm" />
              Retry
            </Button>
            <Button
              onClick={() => navigate("/auth/login")}
              type="button"
              variant="outline"
            >
              Back to sign in
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
