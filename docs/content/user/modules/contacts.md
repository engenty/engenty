---
title: Contacts
description: People and organizations, their roles and relationships — and the agent operations the copilot uses to work with them.
---

# Contacts

Contacts holds the people and organizations you work with: clients, suppliers,
team contacts. A contact can carry several roles (a client on one offer, a
supplier on an invoice), and contacts can be linked to each other through
relations — a person to the company they work for, a company to its subsidiary.

Offers, invoices and projects all point at contacts rather than storing names
of their own, so correcting a client's address here fixes it everywhere it is
printed.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

| Operation | | What it does |
| --- | --- | --- |
| `contacts_list` | Reads | List contacts |
| `contacts_get` | Reads | Get contact by ID |
| `contacts_contact_search` | Reads | Search by name, organization, role, email, location, or relation |
| `contacts_list_relations` | Reads | List contact relations |
| `contacts_linkedin_get_profile` | Reads | Fetch LinkedIn profile data (requires an OAuth connection) |
| `contacts_settings_get` | Reads | Get contacts settings |
| `contacts_create` | Writes | Create contact |
| `contacts_update` | Writes | Update contact |
| `contacts_delete` | Writes | Delete contact |
| `contacts_add_contact_role` | Writes | Add a role to a contact (e.g. when assigning a client on an offer) |
| `contacts_create_relation` | Writes | Create contact relation |
| `contacts_update_relation` | Writes | Update contact relation |
| `contacts_delete_relation` | Writes | Delete contact relation |
| `contacts_settings_update` | Writes | Update contacts settings |

Ask the copilot to *search before creating* when you are not sure whether
someone is already in the system — duplicate contacts are the usual way a
client ends up with two billing addresses.
