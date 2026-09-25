---
name: rich-ui
description: "Load this when a visual answers better than text - in the chat or to create dynamic widgets on the fly: charts, a comparison, a small calculator, tables or forms, visualization, cards, widgets, reports, mini-form or small interactive tool."
---

# Rich UI in chat

- Module records → not here: use `show_objects` (**show-records**).
- A declarative surface from Engenty's own components (cards, lists, forms) → `show_ui`.
- Anything custom (chart, visualization, one-off tool) → `show_widget` with one self-contained HTML document. Its description has the host bridge.
- A result the person keeps (report, briefing, plan, list) → both halves: the whole asset with `artifact_write`, then a `show_ui` teaser here — a Card with the title, the two or three key facts or a short Markdown summary, and a Button "Open" whose action is `open_artifact` with context `{ artifact_id }`; pass `artifact_id` to `show_ui` as well. The teaser is the ad-hoc view in the chat; Open shows the full asset in the side pane.

After rendering, add at most one sentence. The card is the answer.

A scheduled or unattended run has no one watching the chat — do not render widgets there.
