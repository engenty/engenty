---
title: Team chat
description: Channels, DMs and threads for people and agents, optionally mirrored to Slack — and the agent operations the copilot uses.
---

# Team chat

Channels and direct messages inside Engenty, with threads, reactions, pins and
search. Agents can be members: they read a channel, post into it, and are
mentioned like anyone else.

A channel can be **bound to a project**, which surfaces it on the project and in
the activity feed.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

### Reading

| Operation | | What it does |
| --- | --- | --- |
| `team_chat_conversations_list` | Reads | List your channels and DMs with unread state |
| `team_chat_conversations_info` | Reads | Get one conversation and your membership |
| `team_chat_conversations_history` | Reads | Root messages, newest first |
| `team_chat_conversations_replies` | Reads | A thread: parent message and replies |
| `team_chat_conversations_members` | Reads | List members |
| `team_chat_activity_feed` | Reads | Recent mentions of you plus threads you follow |
| `team_chat_message_search` | Reads | Semantic + text search over channels |
| `team_chat_search_messages` | Reads | Full-text search over messages you can see |
| `team_chat_pins_list` | Reads | List pinned messages |
| `team_chat_reactions_get` | Reads | Reactions on a message |
| `team_chat_project_channel_get` | Reads | The channel bound to a project |

### Posting and managing

| Operation | | What it does |
| --- | --- | --- |
| `team_chat_post_message` | Writes | Post a message |
| `team_chat_post_as_agent` | Writes | Post a message authored by an agent |
| `team_chat_update_message` | Writes | Edit a message you authored |
| `team_chat_delete_message` | Writes | Delete a message |
| `team_chat_conversations_create` | Writes | Create a channel (public or private) |
| `team_chat_conversations_open` | Writes | Open or create a DM / group DM |
| `team_chat_conversations_join` | Writes | Join a public channel |
| `team_chat_conversations_leave` | Writes | Leave a channel |
| `team_chat_conversations_invite` | Writes | Invite users or agents |
| `team_chat_conversations_kick` | Writes | Remove a member |
| `team_chat_conversations_rename` | Writes | Rename a channel |
| `team_chat_conversations_archive` | Writes | Archive a channel |
| `team_chat_conversations_unarchive` | Writes | Unarchive a channel |
| `team_chat_conversations_mark` | Writes | Set your read cursor |
| `team_chat_conversations_set_topic` | Writes | Set the topic |
| `team_chat_conversations_set_purpose` | Writes | Set the purpose |
| `team_chat_conversations_update_settings` | Writes | Change conversation settings |
| `team_chat_bind_project` | Writes | Bind a channel to a project |
| `team_chat_pins_add` | Writes | Pin a message |
| `team_chat_pins_remove` | Writes | Unpin a message |
| `team_chat_reactions_add` | Writes | Add a reaction |
| `team_chat_reactions_remove` | Writes | Remove your reaction |

### Slack bridge

| Operation | | What it does |
| --- | --- | --- |
| `team_chat_slack_status` | Reads | Whether a conversation is bound to Slack |
| `team_chat_slack_bound_list` | Reads | List Slack-bound conversations |
| `team_chat_slack_bind` | Writes | Bind a conversation to a Slack channel |
| `team_chat_slack_unbind` | Writes | Remove the Slack binding |
| `team_chat_slack_sync_run` | Writes | Run the Slack inbound sync now |

A message the copilot posts is visible to everyone in the channel. It confirms
before posting on your behalf.
