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

export async function computeBlockHash(prevHash: string, eventType: string, blockId: string, officerId: string, payload: object, timestamp: string): Promise<string> {
  const canonicalPayload = JSON.stringify(payload);
  const input = [prevHash, eventType, blockId, officerId, canonicalPayload, timestamp].join('|');
  return toHex(await crypto.subtle.digest('SHA-256', encode(input)));
}

export async function recordLedgerEvent(eventType: string, blockId: string, officerId: string, department: string, payload: object): Promise<AuditLedgerRow | null> {
  const { data: latest, error: latestError } = await supabase.from('audit_ledger').select('payload_hash').order('id', { ascending: false }).limit(1).maybeSingle();
  if (latestError) { console.warn('Audit ledger latest-row lookup failed:', latestError.message); return null; }
  const createdAt = new Date().toISOString();
  const prevHash = latest?.payload_hash || GENESIS_HASH;
  const payloadHash = await computeBlockHash(prevHash, eventType, blockId, officerId, payload, createdAt);
  const { data, error } = await supabase.from('audit_ledger').insert({ event_type: eventType, block_id: blockId, officer_id: officerId, department, action_payload: payload, payload_hash: payloadHash, prev_hash: prevHash, created_at: createdAt }).select('*').single();
  if (error) { console.warn('Audit ledger write failed:', error.message); return null; }
  return data as AuditLedgerRow;
}

export async function fetchLedgerRows(): Promise<AuditLedgerRow[]> {
  const { data, error } = await supabase.from('audit_ledger').select('*').order('id', { ascending: true });
  if (error) { console.warn('Audit ledger fetch failed:', error.message); return []; }
  return (data || []) as AuditLedgerRow[];
}

export async function verifyLedgerIntegrity(): Promise<{ valid: boolean; rows: AuditLedgerRow[]; invalidId?: number }> {
  const rows = await fetchLedgerRows();
  let previousHash = GENESIS_HASH;
  for (const row of rows) {
    if (row.prev_hash !== previousHash || row.payload_hash !== await computeBlockHash(row.prev_hash, row.event_type, row.block_id, row.officer_id, row.action_payload, row.created_at)) return { valid: false, rows, invalidId: row.id };
    previousHash = row.payload_hash;
  }
  return { valid: true, rows };
}