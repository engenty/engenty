---
title: Workspace search
description: One search across everything indexed — mail, contacts, knowledge, chat — plus the catalog the copilot uses to find its own tools.
---

# Workspace search

The copilot does not have to know which module holds an answer. Workspace search
covers everything indexed across the workspace at once — mail, contacts,
knowledge-base articles, chat — and returns matches with enough context to act
on.

| Operation | | What it does |
| --- | --- | --- |
| `core_workspace_search` | Reads | Search across all indexed workspace content |
| `core_api_catalog_search` | Reads | Search the operation catalog |
| `core_users_create_in_tenant` | Writes | Create a user in the current workspace |

`core_api_catalog_search` is how the copilot finds its own capabilities. When you
ask for something it has not done before, it searches the catalog for a matching
operation rather than guessing — which is why asking in your own words usually
works even when you do not know the feature's name.

Modules also have their own, narrower search operations
(`contacts_contact_search`, `inbox_message_search`,
`knowledge_base_article_search`, `team_chat_message_search`). Those are better
when you already know where to look.
