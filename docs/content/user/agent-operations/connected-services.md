---
title: Connected services
description: What agents can do inside Gmail, Outlook, Drive, OneDrive, Slack, GitHub and S3 once a connection exists.
---

# Connected services

Once a [connection](/user/agent-operations/connections) exists, these operations
become available. Each one runs against the account you connected and follows
that connection's allow / ask / deny policy.

Anything that leaves your workspace — sending a message, posting to a channel,
creating a pull request — asks before it acts unless you have explicitly allowed
it.

## Google

| Operation | | What it does |
| --- | --- | --- |
| `gmail_search_threads` | Reads | Search Gmail threads |
| `gmail_get_thread` | Reads | Read a full thread |
| `gmail_list_drafts` | Reads | List drafts |
| `gmail_list_labels` | Reads | List labels |
| `gmail_get_attachment` | Reads | Fetch an attachment |
| `gmail_create_draft` | Writes | Create a draft |
| `gmail_send_message` | Writes | Send an email |
| `gmail_modify_labels` | Writes | Change a message's labels |
| `gmail_trash_message` | Writes | Move a message to trash |
| `gcal_list_calendars` | Reads | List calendars |
| `gcal_list_events` | Reads | List events |
| `gcal_get_event` | Reads | Get an event |
| `gcal_create_event` | Writes | Create an event |
| `gcal_update_event` | Writes | Update an event |
| `gcal_delete_event` | Writes | Delete an event |
| `gdrive_files_list` | Reads | List a folder |
| `gdrive_files_read` | Reads | Read a file |
| `gdrive_files_search` | Reads | Search files by name |
| `gdrive_files_stat` | Reads | Stat a file or folder |
| `gdrive_search_files` | Reads | Search Drive |
| `gdrive_get_file_metadata` | Reads | Get file metadata |
| `gdrive_read_file_content` | Reads | Read file content as text |
| `gdrive_create_file` | Writes | Create a file |
| `gcontacts_list_contacts` | Reads | List Google Contacts |
| `gcontacts_search_contacts` | Reads | Search Google Contacts |

## Microsoft

| Operation | | What it does |
| --- | --- | --- |
| `outlook_search_messages` | Reads | Search messages |
| `outlook_get_message` | Reads | Get a message with its body |
| `outlook_list_mail_folders` | Reads | List mail folders |
| `outlook_create_draft` | Writes | Create a draft |
| `outlook_send_message` | Writes | Send an email |
| `outlook_move_message` | Writes | Move a message to a folder |
| `outlook_delete_message` | Writes | Delete a message |
| `outlook_list_calendars` | Reads | List calendars |
| `outlook_list_events` | Reads | List events |
| `outlook_get_event` | Reads | Get an event |
| `outlook_create_event` | Writes | Create an event |
| `outlook_update_event` | Writes | Update an event |
| `outlook_delete_event` | Writes | Delete an event |
| `onedrive_files_list` | Reads | List a folder |
| `onedrive_files_read` | Reads | Read a file |
| `onedrive_files_search` | Reads | Search files by name |
| `onedrive_files_stat` | Reads | Stat a file or folder |
| `onedrive_get_item` | Reads | Get an item |
| `onedrive_list_children` | Reads | List folder children |
| `onedrive_search_files` | Reads | Search OneDrive |
| `onedrive_read_file_content` | Reads | Read a text file's content |
| `onedrive_upload_file` | Writes | Upload a text file |

## Slack

| Operation | | What it does |
| --- | --- | --- |
| `slack_list_channels` | Reads | List channels |
| `slack_list_users` | Reads | List users |
| `slack_get_channel_history` | Reads | Read channel history |
| `slack_get_thread_replies` | Reads | Read thread replies |
| `slack_search_messages` | Reads | Search messages |
| `slack_post_message` | Writes | Post a message |
| `slack_update_message` | Writes | Update a message |
| `slack_add_reaction` | Writes | Add a reaction |

## Storage and code

| Operation | | What it does |
| --- | --- | --- |
| `s3_files_list` | Reads | List a folder |
| `s3_files_read` | Reads | Read a file |
| `s3_files_search` | Reads | Search files by name |
| `s3_files_stat` | Reads | Stat a file or folder |
| `s3_files_write` | Writes | Write a file |
| `s3_files_move` | Writes | Move or rename a file |
| `s3_files_delete` | Writes | Delete a file |
| `local_files_list` | Reads | List a folder |
| `local_files_read` | Reads | Read a file |
| `local_files_search` | Reads | Search files by name |
| `local_files_stat` | Reads | Stat a file or folder |
| `github_repos_list` | Reads | List repositories |
| `github_repo_get` | Reads | Get a repository |
| `github_pr_get` | Reads | Get a pull request |
| `github_pr_create` | Writes | Create a pull request |
| `hubspot_list_contacts` | Reads | List HubSpot contacts |
