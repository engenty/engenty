export type DeviceClass = "desktop" | "phone" | "tablet";

const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

/**
 * Collapse a pathname into a coarse route group. Drops space keys, UUIDs,
 * numeric ids, and anything that looks like user content. Query and hash
 * never belong here.
 */
export function routeGroupFromPath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? "/";
  const grouped = path
    .replace(/\/s\/[^/]+/g, "/s/:space")
    .replace(UUID, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/\/+$/, "");
  return grouped.length > 0 ? grouped : "/";
}

export function deviceClassFromWidth(width: number): DeviceClass {
  if (width < 768) {
    return "phone";
  }
  if (width < 1024) {
    return "tablet";
  }
  return "desktop";
}

/** True when a string still looks like an id or user content. */
export function looksLikeUserContent(value: string): boolean {
  if (value.includes("@") || value.includes("?")) {
    return true;
  }
  UUID.lastIndex = 0;
  return UUID.test(value);
}
