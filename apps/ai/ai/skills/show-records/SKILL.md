---
name: show-records
description: Render module records as live chat cards with show_objects — never restate card fields in prose.
---

# Show records

Use when the user asks to **see, list, or work on** module records (contacts, offers, invoices, tasks, team members, …). Call **show_objects** instead of describing them in prose or a markdown table.

Cards stay wired to module data and always show current state.

## Call shape

`show_objects` `{ refs, display?, title?, query?, total? }`

- `refs` — `"<module>:<entity>:<id>"` strings. Entity is not always the module name. Use exactly:
  - `contacts:contact:<uuid>`
  - `offers:offer:<uuid>`
  - `tasks:task:<uuid>`
  - `invoices:invoice:<uuid>`
  - `team:member:<uuid>`
- Resolve ids first via the module's list/search tools (`engenty_tool_execute`), then render.
- `display`: `"inline"` (default) cards in the conversation; `"panel"` side panel; `"expanded"` large view for focused work.
- For a subset of a larger result, pass `total` and `query` so the card can say e.g. "12 of 84".
- Keep inline lists focused — most relevant records (≤10); mention the rest in text.
- Records are **references, not copies** — keep referring by ref; do not re-paste fields into chat.

## Reply after render

**The card is the answer — never repeat it in text.** Names, emails, amounts, statuses, and due dates are already on screen. Restating them as bullets or a markdown table is duplication.

After `show_objects`, add **at most one or two short sentences** the cards do not already say: a count, an answer to what was asked, a pattern, or a next step. If you have nothing to add, say nothing.

```
✅ "All 7 contacts. Two look like the same organisation under different names — want me to merge?"

❌ Restating every field from the cards in a bullet list or markdown table
```
