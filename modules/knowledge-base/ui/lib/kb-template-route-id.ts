/** Route segment for the template editor "create" screen. */
export const KB_TEMPLATE_NEW_ROUTE_ID = "new";

const KB_TEMPLATE_NEW_PATH_RE = /\/templates\/new\/?$/;

/** True when URL is the dedicated new-template editor (`…/templates/new`). */
export function isKbTemplateNewEditorPath(pathname: string): boolean {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return KB_TEMPLATE_NEW_PATH_RE.test(pathOnly);
}

export function isKbTemplateEditorNewRoute(
  templateId: string | undefined,
  pathname?: string
): boolean {
  if ((templateId ?? "").trim() === KB_TEMPLATE_NEW_ROUTE_ID) {
    return true;
  }
  return pathname ? isKbTemplateNewEditorPath(pathname) : false;
}

/** Valid `:templateId` on `/kb/:slug/templates/:templateId` (edit mode). */
export function isKbTemplateRouteIdValid(
  templateId: string | undefined
): boolean {
  const id = (templateId ?? "").trim();
  if (!id || id === KB_TEMPLATE_NEW_ROUTE_ID) {
    return false;
  }
  if (id === "undefined" || id === "null") {
    return false;
  }
  return true;
}

export function resolveKbTemplateRouteId(
  templateId: string | undefined,
  loadedTemplateId: string | undefined
): string {
  const routeId = (templateId ?? "").trim();
  if (isKbTemplateEditorNewRoute(routeId)) {
    return "";
  }
  const loadedId = loadedTemplateId?.trim();
  if (loadedId) {
    return loadedId;
  }
  return isKbTemplateRouteIdValid(routeId) ? routeId : "";
}
