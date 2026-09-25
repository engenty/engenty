-- Regions a gateway can pin inference to for this model (e.g. {eu,us}).
-- Empty = the gateway reports no regional inference. Filled by the catalog
-- sync from gateways that publish it (Vercel `regions`).
alter table ai.model
  add column regions text[] not null default '{}';
