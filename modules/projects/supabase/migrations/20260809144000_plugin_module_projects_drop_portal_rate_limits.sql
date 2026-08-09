-- Drop module_projects.portal_rate_limits — never used.
--
-- Shipped in the module's baseline (20260616001800) as "rate limiting table for
-- portal auth attempts", but nothing was ever written to read or write it: no
-- TypeScript reference anywhere in the workspace, no view, no function, no
-- foreign key pointing at it, and zero rows. Portal auth throttling was never
-- implemented against this table.
--
-- It surfaced during the 2026-08-09 tenant-boundary audit as one of two tables
-- with no tenant column, and the honest answer was that the question does not
-- apply: there is nothing to scope. Adding tenant_id to a table nobody reads
-- would have been the wrong fix, and leaving it there means the next audit has
-- to re-derive that it is dead. Drop it.
--
-- If portal rate limiting is built later it should be designed fresh — this
-- shape (unbounded append of one row per attempt, pruned by nothing) was not a
-- working design. It also predates the module's tenant/scope convention, so a
-- new table would carry tenant_id and scope_id from the start.

drop table if exists module_projects.portal_rate_limits;
