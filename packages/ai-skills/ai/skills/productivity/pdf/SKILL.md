---
name: pdf
description: Create, read, merge, and extract PDF documents.
license: MIT
author: Nous Research, adapted for Engenty
allowed-tools: skill_search skill analyze_file mastra_workspace_execute_command artifact_write
metadata:
  engenty:
    category: productivity
    origin: hermes-agent skills/productivity/pdf
---

# PDF

Create, extract, merge, split, and inspect PDFs. Image-only scans have no text layer — load **ocr-and-documents** instead of pretending to extract text.

## When to Use

Reports, invoices, merging files, pulling text/tables from a digital PDF. Not for pixel-perfect HTML-to-PDF.

## Procedure

1. Try `analyze_file` for summarize/extract on an existing PDF.
2. For merge/split/create, use sandbox Python (`pypdf` / similar) or document tools you actually have. Register the result with `artifact_write`.
3. If a page is image-only, stop and use **ocr-and-documents**.
4. Do not run Hermes `pdf_*.py` helpers or `nano-pdf`.

## Pitfalls

- OCR-ing a born-digital PDF "just in case".
- Filling forms by guessing field names you have not listed.
- Returning a sandbox path instead of an artifact the user can download.
