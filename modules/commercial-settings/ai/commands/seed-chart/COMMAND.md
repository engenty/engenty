---
command: commercial:seed-chart
kind: workflow
workflow_id: commercial-settings.seed-region
label: Seed chart of accounts
description: Merge a regional chart pack into expense categories and tax rates
description_key: commercial-settings:chatCommands.seed-chart
args:
  - name: region
    type: enum
    options: ["AT", "DE", "CH", "GB"]
    required: false
---
