-- Whether this space's `public/` folder shows up for the rest of the company
-- (`/company/spaces/<key>/` in every run). NULL follows the space's
-- visibility: an open team space publishes, a private or personal one does
-- not until its owner turns it on.
ALTER TABLE core.spaces
  ADD COLUMN publish_to_company boolean;

COMMENT ON COLUMN core.spaces.publish_to_company IS 'Whether the space''s public/ folder is readable by every other space as /company/spaces/<key>/. NULL = default by visibility (open publishes, private does not).';
