-- Who an engenty reports to in a space (PLAN-space-engenties.md P3).
--
-- `reports_to` on an AGENT mount names another agent mounted in the same
-- space — the one whose room a routine's settle report and a needs-attention
-- outcome ALSO land in. It is routing, not authority: the space's mount list
-- still decides who may message whom, and nothing here grants access. One
-- nullable column, on purpose — Grok Bot ships its chief-of-staff pattern
-- with no relation model at all, and a taxonomy (works for / supervises /
-- watches) was rejected as one more thing to manage.
--
-- Not a foreign key: the target is an agent KEY (registry id), and the mount
-- it names may be removed later; a dangling value then simply routes nowhere.

alter table core.space_mount
  add column if not exists reports_to text;

alter table core.space_mount
  drop constraint if exists space_mount_reports_to_check;

alter table core.space_mount
  add constraint space_mount_reports_to_check check (
    reports_to is null
    or (resource_type = 'agent' and reports_to <> resource_key)
  );

notify pgrst, 'reload schema';
