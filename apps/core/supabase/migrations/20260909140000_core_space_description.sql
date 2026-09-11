-- What a Space is for, in one sentence (PLAN-space-home.md H14).
--
-- A space had a name, an icon and a colour — enough to recognise it in the
-- rail, not enough to say what it is. The home's heading now introduces the
-- space, and a person arriving in one somebody else set up has nowhere else
-- to read that. Nullable and free text: nothing derives behaviour from it,
-- and a space without one simply shows its name.

alter table core.spaces
  add column if not exists description text;

comment on column core.spaces.description is
  'One line about what this space is for. Shown on the space home; never parsed.';
