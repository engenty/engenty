---
name: contacts-import
title: Contacts import
description: Help the person import contacts from a CSV/Excel export or a connected source by opening the import page beside the chat with the file already loaded.
allowed-tools: cleanup_csv engenty_tools_search engenty_tool_execute open_view workspace_file_publish
---

# Contacts Import

Use this skill when the person wants to bring contacts in from a file, a spreadsheet export (gSales, Outlook, Google, Excel) or a connected source.

## Default: open the import page

The import page does the work you cannot: column mapping with AI suggestions and presets, an Import-ID to match rows on a re-import, a row-by-row preview and a progress bar. Open it beside the chat with `open_view` and coach the person through it.

- **A file is attached in this chat.** Take its `storage_key` from the attachment manifest and call `open_view` with
  `path: "/s/<space_key>/contacts/import?file=<storage_key>&name=<filename>"` (URL-encode both values), `expanded: true`. The page opens on the mapping step with the rows loaded. `<space_key>` is the current Space's key from your runtime context.
- **No file yet.** Call `open_view` with `path: "/s/<space_key>/contacts/import"`, `expanded: true`. Tell the person they can drop a CSV, paste from Excel or Google Sheets, or use "Verbinden" for Google Contacts or Google Drive; connecting starts a sign-in from the page.
- After opening, say in one or two sentences what is on screen and what to check: the Import-ID column (so a later import updates instead of duplicating), the required name fields, the AI Mapping button. Do not repeat what the page already shows.

## Check the file first

When a file is attached, check it on your computer before you open the page, so you can tell the person what to watch for. The file is already there: `/space/agent/contacts.manager/uploads/<file name>` (see "Your computer"). Read it with commands; never paste its content into the chat or read it whole into your context.

1. Look at it with the shell: size and line count (`wc -l`), the first lines (`head -n 5`), the encoding (`file -i`), the separator. For structure use a short Python script (`csv` module): column count per row, empty columns, how often each value repeats.
2. Look for what the page's own cleanup cannot fix:
   - **Encoding:** `Ã¤`, `Ã¶`, `Ã¼` or `�` instead of ä, ö, ü, ß — the export is not UTF-8 (often Windows-1252 / Latin-1).
   - **No header row:** the first row is data (a name, an ID). The page then shows generic column names.
   - **Combined fields:** full name in one column, street and city in one column.
   - **Placeholders and repeats:** the same email or phone on every row, `test`, `n/a`, `-`.
   - **One row, two contacts:** a company and its contact person in the same row.
   - **Duplicates:** the same company or person twice in the file.
3. Tell the person in a few lines what you found and what it means for the import. Skip anything that is fine.

### What fixes itself

The import page cleans the file when it loads: line endings, broken multi-line fields, empty trailing columns, missing headers (it names them). Do not repair these; say the page handles them.

### How to repair the rest

Repair with a script on your computer, never by rewriting rows in the chat.

1. Say what you will change and ask before changing data the person did not mention (dropping a column, merging rows).
2. Write the repaired file to `/space/agent/contacts.manager/work/<name>-fixed.csv`, UTF-8, comma-separated, with a header row. Never change the file in `uploads/` — it is what the person gave you. Typical repairs:
   - wrong encoding: `iconv -f WINDOWS-1252 -t UTF-8`, or decode in Python;
   - no header: add one with the column names you identified;
   - combined fields: split in Python;
   - placeholder values: blank them;
   - company plus person in one row: keep one row per contact only if the person asks — otherwise map the columns on the page.
3. Check the result the same way as the original (row count, a few lines).
4. `workspace_file_publish` with the path gives you a `storage_key`. Open the page with that key and the new name instead of the original: `open_view` with `path: "/s/<space_key>/contacts/import?file=<storage_key>&name=<name>"`, `expanded: true`.
5. Say how many rows you changed and what you changed. Never change a value you are guessing at; ask.

If your run has no computer (no "Your computer" section), check the text you were given with `cleanup_csv` instead, point the person to the right mapping on the page, and ask them to export again (UTF-8, with a header row) when the file needs repairs.

## What you must not claim

- Never say you will dedupe, preview or import the file yourself. The page matches rows on Import-ID or Reference-ID; that is its job, not yours.
- Do not describe steps of the page from memory. If unsure what is on screen, use the page context you were given, or ask the person.

## When to import from chat instead

Use `contacts_bulk_import` only when the data is small, already has exact Contacts field names (`display_name`, `type`, snake_case fields), and the person asks you to just do it, for example rows you extracted from an email or a short list they typed. It is approval-gated and takes at most 1000 rows; rows with an `id` update, rows without create. Search for existing contacts first so you do not create duplicates.

## Tool Process

1. With a file: check it on your computer, repair if needed and publish the result (see "Check the file first"), then `open_view`.
2. For the page: call `open_view` as above. If it fails with "No page is registered", the Contacts app is not mounted in this Space; say so.
3. For chat imports: use `engenty_tools_search` with `moduleId: "contacts"` to find `contacts_bulk_import`, and `engenty_tool_execute` to run it after the duplicate check.
