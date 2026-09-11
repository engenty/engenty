---
command: create-offer
kind: workflow
workflow_id: offers-create-and-edit
label: Create offer
description: Draft a new offer for a contact
args:
  - name: contact
    type: ref
    ref_entity: "contacts:contact"
    required: true
---
