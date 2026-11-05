-- Keep the contribution ledger append-only for client roles.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.savings_challenge_contributions FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT ON TABLE public.savings_challenge_contributions TO authenticated;
