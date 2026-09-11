---
name: offers-search-and-retrieve
title: Search and retrieve offers
description: Search, list, and retrieve offers with status filtering, pagination, and full detail access including blocks.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Search and Retrieve Offers

Use this skill when the user asks to find, list, browse, or inspect existing offers.

Offers are one tenant sales library. A Space mount grants access to that shared book; there is no offer `space_id` and you must not invent one.

## Tool Process

1. Start with `engenty_tools_search` using `moduleId: "offers"` and `kind: "tool"`.
2. Prefer registered operations: `offers_list`, `offers_get`, `offers_get_blocks`.
3. Use `engenty_tool_execute` to run the found operations.

## Context Awareness

When the user asks about "this offer" or "the current offer", check the UI state snapshot first:
- `selection.entity_id` — the currently open offer's ID
- `page.offer_id` — the offer ID on the current page
- `page.offer_status`, `page.offer_number`, `page.offer_title` — quick context without a round-trip

Use this preloaded data for summary questions. Call `offers_get` only when fresh or complete data is needed.

## Listing Offers

Use `offers_list` with these optional parameters:
- `status` — filter by `"draft"`, `"ready"`, or `"accepted"`
- `client_id` — filter to offers linked to one contact (use the contact's UUID)
- `search` — full-text search on title and offer number
- `page` / `pageSize` — pagination (default pageSize: 25, max: 200)
- `sortBy` — `title`, `offer_number`, `status`, `offer_date`, `valid_until`, `created_at`
- `sortOrder` — `asc` or `desc`

## Getting Offer Details

Use `offers_get` with `{ id: "<offer-id>" }` to retrieve the full offer object including all metadata, billing settings, and recipient info.

## Getting Offer Blocks

Use `offers_get_blocks` with `{ id: "<offer-id>" }` to retrieve the content blocks (line items, phases, headings) ordered by `order_index`.

## Presenting Results

- Show offer number, title, status, and offer date in summaries.
- Use status labels: `draft` = Draft, `ready` = Ready, `accepted` = Accepted.
- When listing, include total count from the response.
- Do not expose raw UUIDs unless the user needs an exact ID for a follow-up action.
