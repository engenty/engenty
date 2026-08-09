---
title: Browser
description: Letting an agent drive a real browser window for things that have no API.
---

# Browser

Some work has no API — an old supplier portal, a form that must be filled in a
real browser. The browser bridge gives an agent a managed browser window it can
navigate, read and interact with, while you watch.

| Operation | | What it does |
| --- | --- | --- |
| `browser_navigate` | Reads | Navigate the managed window to a URL |
| `browser_observe` | Reads | Read the current page as a structured outline |
| `browser_tabs` | Reads | List the window's tabs |
| `browser_reload` | Reads | Reload a tab |
| `browser_wait_for` | Reads | Wait for text or an element to appear |
| `browser_click` | Writes | Click an element |
| `browser_fill` | Writes | Fill an input |

Two limits worth knowing:

- Agents may only reach origins on the connection's **allowlist**. A page you
  have not permitted is not reachable, whatever the page says.
- The browser is for sites that have no other route in. For anything inside
  Engenty, agents use the operations on these pages instead — those validate
  input, report what changed, and can be approved and audited. A click cannot.
