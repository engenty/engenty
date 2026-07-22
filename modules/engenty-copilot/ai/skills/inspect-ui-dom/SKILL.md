---
name: inspect-ui-dom
description: Inspect or drive the live app UI — prefer scoped DOM snapshots over screenshots.
---

# Inspect UI (DOM first)

Use when you need live controls on the current page (find a button, confirm a field, click/type), not when the AG-UI page brief already answers the question.

## Prefer DOM over screenshot

1. Read **Current page** `dom_entry_points` (`app_bar`, `sidebar`, `topbar`, `main`, optional `list` / `detail`).
2. Call **browser_dom_snapshot** with `root_selector` set to the best region:
   - Page content / records → `list` or `detail`, else `main`
   - Module secondary nav → `sidebar`
   - Primary app rail → `app_bar`
   - Breadcrumbs / page chrome → `topbar`
3. If a region selector is missing, fall back to `main` (`[data-engenty-region="main"]`).
4. Use **browser_click** / **browser_focus** / **browser_input** / **browser_scroll** with selectors from the snapshot.
5. Call **browser_screenshot** only for visual/layout questions the DOM cannot answer (overlap, spacing). It returns a text inventory, not pixels.

Do not snapshot `document.body` unless the question is about whole-page chrome.
