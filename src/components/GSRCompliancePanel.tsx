import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { GSRComplianceResult } from '../utils/gsrRuleEngine';

export const GSRCompliancePanel: React.FC<{ result: GSRComplianceResult; compact?: boolean }> = ({ result, compact = false }) => (
  <div className={`rounded border ${result.isCompliant ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'} ${compact ? 'p-2.5' : 'p-3'}`}>
    <div className={`flex items-start gap-2 text-[11px] font-bold ${result.isCompliant ? 'text-emerald-800' : 'text-red-800'}`}>
      {result.isCompliant ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
      <span>{result.isCompliant ? 'G&SR Safety Audit Pass: Headway Verified | 25kV OHE Cutoff Confirmed | Interlocking Safe' : 'G&SR Safety Audit requires remediation before final action'}</span>
    </div>
    {!result.isCompliant && <div className="mt-2 space-y-1.5">{result.violations.map((rule) => <div key={rule.ruleId} className="text-[10px] text-red-800"><strong>{rule.ruleId} - {rule.title}:</strong> {rule.message} {rule.remediation && <span className="font-semibold">Remediation: {rule.remediation}</span>}</div>)}</div>}
    {result.isCompliant && !compact && <div className="mt-2 grid gap-1 text-[10px] text-emerald-700 sm:grid-cols-2">{result.passedRules.map((rule) => <span key={rule.ruleId} className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{rule.ruleId}: {rule.title}</span>)}</div>}
  </div>
);