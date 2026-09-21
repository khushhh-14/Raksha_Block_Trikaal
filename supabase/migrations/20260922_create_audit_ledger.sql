CREATE TABLE IF NOT EXISTS audit_ledger (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  block_id VARCHAR(64) NOT NULL,
  officer_id VARCHAR(64) NOT NULL,
  department VARCHAR(64) NOT NULL,
  action_payload JSONB NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  prev_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_ledger_block ON audit_ledger(block_id);

CREATE OR REPLACE FUNCTION prevent_audit_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_ledger is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_ledger_immutable ON audit_ledger;
CREATE TRIGGER audit_ledger_immutable
  BEFORE UPDATE OR DELETE ON audit_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_ledger_mutation();

ALTER TABLE audit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_ledger_read_authenticated ON audit_ledger;
DROP POLICY IF EXISTS audit_ledger_insert_authenticated ON audit_ledger;
DROP POLICY IF EXISTS audit_ledger_read_anon ON audit_ledger;
DROP POLICY IF EXISTS audit_ledger_insert_anon ON audit_ledger;
CREATE POLICY audit_ledger_read_authenticated ON audit_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY audit_ledger_insert_authenticated ON audit_ledger FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY audit_ledger_read_anon ON audit_ledger FOR SELECT TO anon USING (true);
CREATE POLICY audit_ledger_insert_anon ON audit_ledger FOR INSERT TO anon WITH CHECK (true);