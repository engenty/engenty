---
command: create-invoice
kind: action
action_id: invoices-create-and-edit
label: Create invoice
description: Draft a new invoice for a contact
args:
  - name: contact
    type: ref
    ref_entity: "contacts:contact"
    required: true
---
