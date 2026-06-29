export interface CopilotRouteContext {
  moduleId: string;
  pathname?: string;
  routeKey: string;
  scope?: Record<string, unknown>;
}
