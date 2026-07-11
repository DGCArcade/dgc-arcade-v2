BEGIN;

CREATE TABLE IF NOT EXISTS system_caches (
  cache_key text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT 'null'::jsonb,
  version integer NOT NULL DEFAULT 1,
  source_updated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMIT;
