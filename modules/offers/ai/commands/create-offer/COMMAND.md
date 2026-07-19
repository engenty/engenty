---
command: create-offer
kind: action
action_id: offers-create-and-edit
label: Create offer
description: Draft a new offer for a contact
args:
  - name: contact
    type: ref
    ref_entity: "contacts:contact"
    required: true
---
