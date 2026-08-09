---
name: company-profile-branding-assets
title: Set the company logo and branding assets
description: Upload or replace the company logo and other tenant image assets, and understand where they surface across documents.
allowed-tools: engenty_tools_search engenty_tool_execute navigate
---

# Company Logo and Branding Assets

## Setting the logo

`company_profile_set_logo` with `{ "image_url": "<url>" }`. It accepts either:

- a **public** image URL — the operation re-hosts it into tenant storage, so the
  stored logo does not break when the source disappears, or
- a base64 data URL (`data:image/png;base64,…`; PNG, JPEG, GIF or WebP).

Pass `null` to remove the logo.

Do not set `logo_url` through `company_profile_set`. That writes the string
verbatim without re-hosting, so the profile ends up pointing at somebody else's
server — the logo then breaks, or silently changes, outside your control.

## Other assets

`company_profile_upload_asset` takes a base64 data URL and returns a public URL
in tenant storage. Use it when you need a hosted image URL for something other
than the logo — for example a letterhead you then reference from a PDF template.

## Where the logo appears

The sender block and footer of generated offer and invoice PDFs, wherever the
template renders `sender.logo_url`. A template can also carry its own separate
letterhead image in `settings_json.letterhead` — that is a **different** asset,
set per template, not here. When a user says "the logo on my invoices is wrong",
check which of the two they mean before changing anything.

## Practical notes

- Prefer a transparent PNG or an SVG-exported PNG. The logo renders on the
  document's page background, and a white box around it is the most common
  complaint.
- A logo found by web search is a guess unless the user confirms it. Show them
  the URL and ask before setting it — a wrong logo goes out on client documents.
- Confirm the result: the operation returns the saved settings, so read
  `logo_url` back and tell the user it is set. Do not report success otherwise.
- The user can review it at `/settings/company-profile`.
