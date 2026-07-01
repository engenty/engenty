---
name: kb-faq-content-management
title: KB FAQ content management
description: List, retrieve, create, update, archive, delete, and partially edit Knowledge Base FAQs through catalog-backed operations and routes.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# KB FAQ Content Management

Use this skill when the user wants to search, create, edit, publish, archive, delete, or organize Knowledge Base FAQ entries.

## Tool Process

1. Start with `engenty_tools_search` using `moduleId: "knowledge-base"` and `kind: "tool"`.
2. Use `kb_faqs_list` for FAQ listing and FAQ search.
3. Use `engenty_tool_execute` before FAQ writes or when schemas are unclear.
4. Use first-class operations for writes: `kb_faq_create`, `kb_faq_update`, and `kb_faq_delete`.

## Find FAQs

- Use `kb_list` first when the target KB is ambiguous or the user asks across all KBs.
- Use `kb_faqs_list` with `kb_id` for FAQ inventory in one KB.
- Use `kb_faqs_list` with `search` for question and answer lookup.
- For all-KB FAQ search, call `kb_list`, then run `kb_faqs_list` once per `kb_id` and keep results grouped by KB.

## Create FAQs

- Use `kb_faq_create` to insert new FAQ entries.
- Pass `kb_id`, `question`, `answer_markdown`, and optional status/tag fields.
- Default to draft unless the user explicitly asks to publish.
- Check for duplicates first with `kb_faqs_list` and, when relevant, `knowledge_base_article_search`.
- Prefer inbox promote to FAQ when the FAQ should keep provenance from a source capture.

## Partial FAQ Edits

- Use `kb_faq_update` with the `faq_id` and a `patch` body containing the fields to update.
- Send only fields that should change, such as `question`, `answer_markdown`, `status`, tags, metadata, or sort order.
- Read or list the FAQ first so the patch is based on current content.
- For bulk FAQ edits, ask one clear confirmation, then run one update per FAQ id.

## Delete, Archive, Versions

- Prefer archive/status changes over permanent delete when the user is unsure.
- If delete is required, use `kb_faq_delete` only after explicit confirmation.

## Safety And Reporting

- Cite FAQ ids and questions in confirmations and final summaries.
- Do not invent FAQ ids, KB ids, or in-app routes. Use ids returned by tools.
- If an operation returns an error, stop and report it to the user.
