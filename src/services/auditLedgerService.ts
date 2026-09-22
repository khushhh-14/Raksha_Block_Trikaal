import { supabase } from '../lib/supabase';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditLedgerRow {
  id: number;
  event_type: string;
  block_id: string;
  officer_id: string;
  department: string;
  action_payload: Record<string, unknown>;
  payload_hash: string;
  prev_hash: string;
  created_at: string;
}

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const toHex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const LOCAL_LEDGER_KEY = 'raksha_block_audit_ledger';

function readLocalRows(): AuditLedgerRow[] {
  try {
    const stored = localStorage.getItem(LOCAL_LEDGER_KEY);
    return stored ? JSON.parse(stored) as AuditLedgerRow[] : [];
  } catch {
    return [];
  }
}

function writeLocalRows(rows: AuditLedgerRow[]): void {
  try {
    localStorage.setItem(LOCAL_LEDGER_KEY, JSON.stringify(rows));
  } catch (error) {
    console.warn('Local audit ledger persistence failed:', error);
  }
}

export async function computeBlockHash(prevHash: string, eventType: string, blockId: string, officerId: string, payload: object, timestamp: string): Promise<string> {
  const canonicalPayload = JSON.stringify(payload);
  const input = prevHash + eventType + blockId + officerId + canonicalPayload + timestamp;
  return toHex(await crypto.subtle.digest('SHA-256', encode(input)));
}

export async function recordLedgerEvent(eventType: string, blockId: string, officerId: string, department: string, payload: object): Promise<AuditLedgerRow | null> {
  const createdAt = new Date().toISOString();
  const localRows = readLocalRows();
  let databaseAvailable = false;
  let previousHash = localRows.at(-1)?.payload_hash || GENESIS_HASH;
  try {
    const { data: latest, error: latestError } = await supabase.from('audit_ledger').select('payload_hash').order('id', { ascending: false }).limit(1).maybeSingle();
    databaseAvailable = !latestError && Boolean(latest);
    if (databaseAvailable) previousHash = latest!.payload_hash;
  } catch (error) {
    console.warn('Audit ledger latest-row lookup failed:', error);
  }
  const prevHash = previousHash;
  const payloadHash = await computeBlockHash(prevHash, eventType, blockId, officerId, payload, createdAt);
  const localRow: AuditLedgerRow = { id: (localRows.at(-1)?.id || 0) + 1, event_type: eventType, block_id: blockId, officer_id: officerId, department, action_payload: payload as Record<string, unknown>, payload_hash: payloadHash, prev_hash: prevHash, created_at: createdAt };
  if (!databaseAvailable) {
    const updatedRows = [...localRows, localRow];
    writeLocalRows(updatedRows);
    return localRow;
  }
  try {
    const { data, error } = await supabase.from('audit_ledger').insert({ event_type: eventType, block_id: blockId, officer_id: officerId, department, action_payload: payload, payload_hash: payloadHash, prev_hash: prevHash, created_at: createdAt }).select('*').single();
    if (!error && data) return data as AuditLedgerRow;
    console.warn('Audit ledger write failed; using local chain:', error?.message);
  } catch (error) {
    console.warn('Audit ledger write failed; using local chain:', error);
  }
  const updatedRows = [...localRows, localRow];
  writeLocalRows(updatedRows);
  return localRow;
}

export async function fetchLedgerRows(): Promise<AuditLedgerRow[]> {
  try {
    const { data, error } = await supabase.from('audit_ledger').select('*').order('id', { ascending: true });
    if (!error && data && data.length > 0) return data as AuditLedgerRow[];
    if (error) console.warn('Audit ledger fetch failed; using local chain:', error.message);
  } catch (error) {
    console.warn('Audit ledger fetch failed; using local chain:', error);
  }
  return readLocalRows();
}

export async function verifyLedgerIntegrity(): Promise<{ isValid: boolean; rows: AuditLedgerRow[]; invalidId?: number }> {
  const rows = await fetchLedgerRows();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const isGenesisRecord = (index === 0 || row.event_type === 'GENESIS') && (row.prev_hash === GENESIS_HASH || row.id === 1);
    if (index === 0 && !isGenesisRecord) {
      return { isValid: false, rows, invalidId: row.id };
    }
    if (index > 0 && row.prev_hash !== rows[index - 1].payload_hash) {
      return { isValid: false, rows, invalidId: row.id };
    }
    const hashMatches = row.payload_hash === await computeBlockHash(row.prev_hash, row.event_type, row.block_id, row.officer_id, row.action_payload, row.created_at);
    if (!hashMatches) return { isValid: false, rows, invalidId: row.id };
  }
  return { isValid: true, rows };
}