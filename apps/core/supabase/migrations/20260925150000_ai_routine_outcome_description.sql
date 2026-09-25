-- A delivery target says in a few words what it is for ("Zusammenfassung an
-- das Vertriebsteam"), so the flow and the approval card can show each one.

alter table ai.routine_outcomes add column description text;

comment on column ai.routine_outcomes.description is
  'Short, person-written note on what this delivery is for. Shown on the routine flow and the approval card.';
