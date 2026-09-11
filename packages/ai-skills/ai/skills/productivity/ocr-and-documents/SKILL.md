---
name: ocr-and-documents
description: Extract text from scans and image-only PDFs.
license: MIT
author: Hermes Agent, adapted for Engenty
allowed-tools: skill_search skill analyze_file mastra_workspace_execute_command artifact_write
metadata:
  engenty:
    category: productivity
    origin: hermes-agent skills/productivity/ocr-and-documents
---

# OCR and documents

Extract text from scans, photos, and image-only PDFs. Digital PDFs with a text layer belong to **pdf**.

## When to Use

Scanned contracts, photos of whiteboards, PDFs where `analyze_file` returns no usable text.

## Procedure

1. Try `analyze_file` first — some pipelines already OCR.
2. If text is empty or garbage, run sandbox OCR only with tools actually installed. Do not assume `marker-pdf` or `pymupdf` are present; check, then install only if the sandbox allows it and the user wants that.
3. Write the extracted text as an artifact (`artifact_write`) and keep page numbers next to quotes.
4. For citations, load **grounded-citations**. For obligations, load **document-to-action-items**.

## Pitfalls

- Treating OCR as verbatim legal text without flagging uncertainty.
- Skipping **pdf** on a born-digital file.
- Running heavy local models without saying they may be unavailable.
