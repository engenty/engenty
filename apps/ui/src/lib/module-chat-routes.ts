// A full-page module hub chat surface, e.g. /mdl/<module>/<slug>/chat
const MODULE_HUB_CHAT_PATH_RE = /^\/mdl\/[^/]+\/[^/]+\/chat\/?$/;

export function isModuleHubChatRoute(pathname: string): boolean {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return MODULE_HUB_CHAT_PATH_RE.test(pathOnly);
}
