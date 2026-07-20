-- Memory Phase 6: human edits keep the original provenance and add
-- updated_by (the provenance chip reads "copilot · edited by you").
alter table module_memory.records
  add column if not exists updated_by text;
