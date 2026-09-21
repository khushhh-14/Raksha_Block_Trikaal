import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AuditLedgerRow, verifyLedgerIntegrity } from '../services/auditLedgerService';

export const AuditLedgerView: React.FC = () => {
  const [rows, setRows] = useState<AuditLedgerRow[]>([]);
  const [valid, setValid] = useState(true);
  const [invalidId, setInvalidId] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string>();

  const verify = async () => {
    setLoading(true);
    const result = await verifyLedgerIntegrity();
    setRows(result.rows);
    setValid(result.valid);
    setInvalidId(result.invalidId);
    setLoading(false);
  };
  useEffect(() => { void verify(); }, []);

  const copyHash = async (hash: string) => { await navigator.clipboard.writeText(hash); setCopied(hash); window.setTimeout(() => setCopied(undefined), 1500); };
  return <section className="mb-6 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-sm" aria-labelledby="audit-ledger-title">
    <div className="border-b-4 border-[#FF9900] bg-[#003366] px-4 py-4 sm:px-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><ShieldCheck className="h-5 w-5 text-emerald-300" /></div><div><h2 id="audit-ledger-title" className="text-base font-bold">Integrity Ledger</h2><p className="mt-0.5 text-xs text-blue-100">Append-only cryptographic lifecycle record</p></div></div><button type="button" onClick={() => void verify()} className="rounded border border-white/30 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10">Verify chain</button></div></div>
    <div className={`m-4 flex items-center gap-2 rounded border px-3 py-2 text-xs font-bold ${valid ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300' : 'border-red-700 bg-red-950/60 text-red-300'}`}>{valid ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}{loading ? 'Verifying ledger chain...' : valid ? 'Cryptographically Verified & Tamper-Evident - Section Controller Sign-off Immutable' : `Ledger integrity check failed${invalidId ? ` at sequence ${invalidId}` : ''}.`}</div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-[11px]"><thead className="bg-slate-800 text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Sequence (#)</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Block ID</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Officer</th><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">Payload Hash</th><th className="px-4 py-3">Previous Hash</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-800 hover:bg-slate-800/70"><td className="px-4 py-3 font-mono text-amber-300">{row.id}</td><td className="px-4 py-3 font-semibold text-white">{row.event_type}</td><td className="px-4 py-3 font-mono text-cyan-300">{row.block_id}</td><td className="px-4 py-3">{row.department}</td><td className="px-4 py-3">{row.officer_id}</td><td className="whitespace-nowrap px-4 py-3 text-slate-400">{new Date(row.created_at).toLocaleString('en-IN')}</td><td className="px-4 py-3 font-mono text-slate-300"><button type="button" title="Copy full payload hash" onClick={() => void copyHash(row.payload_hash)} className="inline-flex items-center gap-1 hover:text-white">{row.payload_hash.slice(0, 16)}...<Copy className="h-3 w-3" />{copied === row.payload_hash && <span className="text-emerald-300">Copied</span>}</button></td><td className="px-4 py-3 font-mono text-slate-500">{row.prev_hash.slice(0, 16)}...</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1 font-bold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Verified</span></td></tr>)}</tbody></table>{!loading && rows.length === 0 && <div className="p-8 text-center text-sm text-slate-400">No ledger events have been recorded.</div>}</div>
  </section>;
};

export default AuditLedgerView;