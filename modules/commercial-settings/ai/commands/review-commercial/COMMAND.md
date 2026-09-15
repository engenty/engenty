---
command: review-commercial
kind: prompt
label: Review commercial settings
description: Compare stored commercial defaults to the region chart pack
---

The user invoked /review-commercial with this extra context: {input}

Review tenant commercial settings against the matching region pack. Load the
stored row first, resolve the region from default_locale unless the user named
one, then report missing tax rates, missing category codes, empty Kontoklasse
or account numbers, and any Austrian expense whose account starts with 4.
Do not write unless the user explicitly asks to seed or fix after the review.
