---
command: seed-chart
kind: workflow
workflow_id: commercial-settings.seed-region
label: Seed chart of accounts
description: Merge a regional chart pack into expense categories and tax rates
args:
  - name: region
    type: enum
    options: ["AT", "DE", "CH", "GB"]
    required: false
---
