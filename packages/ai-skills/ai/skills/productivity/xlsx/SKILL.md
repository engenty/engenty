---
name: xlsx
description: Create, read, and edit Excel workbooks and CSVs.
license: MIT
author: Nous Research, adapted for Engenty
allowed-tools: skill_search skill analyze_file mastra_workspace_execute_command artifact_write
metadata:
  engenty:
    category: productivity
    origin: hermes-agent skills/productivity/xlsx
---

# Xlsx

Work with `.xlsx` and CSV. Prefer Engenty file tools before writing custom scripts.

## When to Use

Reports, sheet inventory, CSV conversion, or editing cells in a workbook the user provided.

## Procedure

1. Locate the file (workspace `/home`, Space files, or a vault/download tool).
2. For inspection and summaries, try `analyze_file` first.
3. For create/edit that analyze cannot do, use the sandbox: Python with openpyxl (or the project's equivalent). Write outputs under `/sandbox` then register with `artifact_write { title, file: { key } }`.
4. Do not vendor Hermes `xlsx_*.py` CLIs. Do not claim LibreOffice recalc unless that binary is actually present.

## Pitfalls

- Treating `.xls` as `.xlsx`.
- Dumping huge sheets into chat instead of an artifact/download.
- Recalculating formulas in Python and presenting cached Excel values as live.
