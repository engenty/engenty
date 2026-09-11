---
name: inbox-connect-account
title: Connect a mail account
description: Guide the user through connecting Gmail or Outlook and enabling inbox sync, using the connections connect card.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Connect a mail account

Use this skill when the inbox is empty, the user asks to connect their email, an
account's sync is disabled or failing, or any inbox tool implies there is no
usable account.

## Spaces

- `inbox_list_accounts` in a Space returns **only mounted mailboxes**.
- If an account exists for the tenant but is absent here, tell the user to
  **mount it in Space setup**. Do not run `connections_request_connect` to
  reconnect an account that is merely unmounted.

## Workflow

1. **Check what exists:** `inbox_list_accounts`. Each account row has
   `connection_id`, `connector_id`, `display_name`/`external_account`, `sharing`
   (`personal`/`org`), and a `sync_state` (`sync_enabled`, `backfill_days`,
   `last_synced_at`, `last_error`).
   - Usable account present → skip to step 4 (sync health).
   - Empty in a Space → the mailbox may exist for the tenant and only need a
     Space mount. Ask about mounting before offering a new connect card.
2. **Offer the connect card:** no account → ask which provider if unclear (with
   `requestDecision` when your tools include it — one choice per provider — and
   in plain prose otherwise; never invent a tool for this), then
   run the catalog operation `connections_request_connect` with
   `connector_id: "google-gmail"` or `connector_id: "microsoft-outlook"`.
   Interpret the result:
   - `configured: true, connected: false` → a one-click connect button is now
     shown to the user in chat. Tell them to click it and complete the provider
     sign-in; wait for them to say it is done.
   - `connected: true` → an account already exists (listed in `accounts`);
     go to step 4.
   - `configured: false` → the connector has no client credentials yet. Tell the
     user an **admin** must add them under Setup → Platform settings. Stop —
     you cannot connect without that.
3. **Verify:** after the user reports connecting, re-run `inbox_list_accounts`
   and confirm the new connection appears.
4. **Enable sync:** if `sync_state` is missing or `sync_enabled` is false, call
   `inbox_update_sync_settings` with `connection_id`, `sync_enabled: true`, and
   optionally `backfill_days` (how far back to import — confirm the user's
   preference before setting a large window).
5. **First sync:** `inbox_sync_now` with the `connection_id` (or without it to
   sync every account). Then confirm mail arrived via `inbox_list_threads`.
6. **Sync problems:** a `last_error` with a stale `last_synced_at` usually means
   expired provider credentials — offer the connect card again (step 2) to
   re-authenticate, then re-run the sync.

## Rules

- Never ask the user for passwords, OAuth codes, or tokens — the connect card
  handles authentication entirely.
- Personal accounts: only the owner can change their sync settings; the
  operation enforces this — surface its error rather than pre-arguing.
- Do not set `backfill_days` to a large value on your own initiative.

## Starter prompts

- Connect my email account.
- Why is my inbox empty?
- My mail stopped syncing.
