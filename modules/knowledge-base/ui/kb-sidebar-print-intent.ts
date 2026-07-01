const KEY = "engenty.kb.sidebar_print_article_id";

/** Sidebar “print page” stores the target article id before navigating to detail. */
export function setKbSidebarPrintArticleIntent(articleId: string): void {
  try {
    sessionStorage.setItem(KEY, articleId);
  } catch {
    /* quota / private mode */
  }
}

/** Returns true once if `articleId` matches the pending intent, then clears storage. */
export function takeKbSidebarPrintArticleIntent(articleId: string): boolean {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v !== articleId) {
      return false;
    }
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
