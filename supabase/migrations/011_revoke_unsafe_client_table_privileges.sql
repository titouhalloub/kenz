-- RLS does not protect TRUNCATE, REFERENCES, or TRIGGER privileges.
-- Keep client roles limited to row-level operations controlled by RLS.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
