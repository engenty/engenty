---
command: invoices:create
kind: workflow
workflow_id: invoices-create-and-edit
label: Create invoice
description: Draft a new invoice for a contact
description_key: invoices:chatCommands.create
args:
  - name: contact
    type: ref
    ref_entity: "contacts:contact"
    required: true
---
