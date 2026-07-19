---
title: Connect Slack
description: Create a Slack app, connect your workspace, and mirror team-chat channels to Slack with the Slack bridge.
---

# Connect Slack

Engenty can mirror **Team Chat** channels to a Slack workspace in both
directions — messages you post in Engenty appear in Slack, and messages from
Slack appear in the bound Engenty channel. This runs on the **Slack bridge**
(a Pro feature) on top of a normal Slack connection.

Connecting Slack is a one-time setup with three parts:

1. [Create a Slack app](#1-create-a-slack-app) and copy its credentials (admin, once per Engenty deployment).
2. [Connect your Slack workspace](#2-connect-your-workspace) from Settings → Connections.
3. [Bind channels](#3-bind-channels) you want mirrored, on the Slack bridge page.

> **Who needs to do what.** Step 1 is done once by whoever operates your Engenty
> deployment — the resulting Client ID and Secret are the *app's* identity, not a
> workspace, so one app serves every workspace. Steps 2 and 3 are done by each
> person/tenant connecting their own workspace.

---

## 1. Create a Slack app

This produces the OAuth credentials Engenty needs. Do it once; the same app
works for every workspace that later connects.

1. Go to **[api.slack.com/apps](https://api.slack.com/apps)** and choose
   **Create New App → From scratch**. Give it a name (e.g. "Engenty") and pick
   any workspace to develop it in.
2. Open **OAuth & Permissions** in the left sidebar.
3. Under **User Token Scopes** (not *Bot* Token Scopes), add these eight scopes:

   ```
   channels:read
   groups:read
   channels:history
   groups:history
   search:read
   chat:write
   reactions:write
   users:read
   ```

   ![Slack OAuth & Permissions — User Token Scopes](/images/connect-slack/03-slack-user-scopes.png)

4. Still on **OAuth & Permissions**, under **Redirect URLs**, click
   **Add New Redirect URL** and enter your deployment's callback URL exactly —
   `https`, no trailing slash:

   ```
   https://<your-engenty-domain>/api/connections/oauth/callback
   ```

   For example, on a local dev domain that would be
   `https://team-chat.engenty.localhost/api/connections/oauth/callback`.
   Click **Add**, then **Save URLs**.

   ![Slack OAuth & Permissions — Redirect URLs](/images/connect-slack/04-slack-redirect-url.png)

5. Open **Basic Information → App Credentials** and copy the **Client ID** and
   **Client Secret**.

6. Give those two values to your Engenty deployment as environment variables:

   ```
   SLACK_OAUTH_CLIENT_ID=<client id>
   SLACK_OAUTH_CLIENT_SECRET=<client secret>
   ```

   In local development you can set them with the CLI (the secret is entered
   interactively and never printed):

   ```bash
   pnpm engenty env edit SLACK_OAUTH_CLIENT_ID
   pnpm engenty env edit SLACK_OAUTH_CLIENT_SECRET
   ```

   Restart the app afterwards so the new values load.

> **Connecting more than one workspace?** If workspaces *other than* the one you
> built the app in should be able to connect, enable **Manage Distribution →
> Activate Public Distribution** on the Slack app. For a single workspace you
> can skip this.

---

## 2. Connect your workspace

1. In Engenty, open **Settings → Connections**.
2. Find the **Slack** card and click **Connect**.

   ![Settings → Connections — Slack card](/images/connect-slack/01-connections-slack-card.png)

3. Engenty sends you to Slack's authorization screen. **Make sure you're signed
   in to the workspace you want to mirror** — Slack picks the workspace from your
   browser session, so switch workspaces on the Slack page if the wrong one
   appears.
4. Review the requested scopes and click **Allow**.

   ![Slack authorization — Allow](/images/connect-slack/05-slack-authorize.png)

5. Slack returns you to Engenty and the Slack card now shows your workspace as
   connected.

---

## 3. Bind channels

With the workspace connected, choose which channels to mirror.

1. Open **Settings → Slack bridge**.
2. Each Team Chat channel is listed with a picker. Choose the Slack channel to
   mirror it to and click **Bind**.
3. Bound channels show **Sync** (pull recent Slack messages now) and **Unbind**.
   **Sync all now** runs the pull for every bound channel.

![Settings → Slack bridge — bind channels](/images/connect-slack/06-slack-bridge-settings.png)

Once a channel is bound, new Engenty messages replay to Slack automatically, and
Slack messages are pulled in on a periodic sync (and whenever you press Sync).

> **Allow the write actions.** For the bridge to post to Slack on its own, the
> Slack connection's write actions (`post_message`, `update_message`) must be set
> to **Allow** — otherwise outbound messages park as approval requests. You can
> set this per action on the connection under **Settings → Connections**.

---

## Troubleshooting

**"redirect_uri did not match any configured URIs"** — the callback URL Engenty
sent isn't in the Slack app's **Redirect URLs**. Add the exact value from
[step 1.4](#1-create-a-slack-app) (character-for-character: `https`, correct
domain, no trailing slash) and **Save URLs**, then retry.

**"OAuth client credentials missing: set SLACK_OAUTH_CLIENT_ID and
SLACK_OAUTH_CLIENT_SECRET"** — the environment variables from
[step 1.6](#1-create-a-slack-app) aren't set, or the app wasn't restarted after
setting them.

**Wrong workspace on the Slack sign-in page** — Slack routes by your browser
session. Sign in to (or switch to) the correct workspace on the Slack page, then
start **Connect** again.

**Nothing appears in Slack after posting** — check that the connection's write
actions are set to **Allow** (see the note above); with the default "Ask"
policy, replays wait as approval requests instead of posting.
