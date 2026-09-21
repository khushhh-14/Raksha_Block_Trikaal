import defectsCsv from '../../data/synthetic/defects.csv?raw';
import { NormalisedDefect, SourceAdapter } from './types';

export interface TmsRawRecord {
  defect_id: string;
  source_system: string;
  department: string;
  section: string;
  severity: string;
  days_overdue: string;
  asset_age_years: string;
  past_failure_count: string;
  deferred_count: string;
  calculated_risk_score: string;
  failed_within_90d?: string;
}

const parseCsv = (raw: string): TmsRawRecord[] => {
  const [header, ...rows] = raw.trim().split(/\r?\n/);
  const columns = header.split(',');
  return rows.map((row) => Object.fromEntries(row.split(',').map((value, index) => [columns[index], value])) as unknown as TmsRawRecord);
};

export const tmsAdapter: SourceAdapter<TmsRawRecord> = {
  sourceId: 'TMS', sourceName: 'Track Management System', department: 'ENGINEERING', lastSyncAt: null, recordCount: 0, status: 'OFFLINE',
  async fetchRecords() { return parseCsv(defectsCsv).filter((record) => record.source_system === 'TMS'); },
  normalise(raw) { return { defectId: raw.defect_id, sourceSystem: raw.source_system, department: 'ENGINEERING', section: raw.section, severity: Number(raw.severity), daysOverdue: Number(raw.days_overdue), assetAgeYears: Number(raw.asset_age_years), pastFailureCount: Number(raw.past_failure_count), deferredCount: Number(raw.deferred_count), calculatedRiskScore: Number(raw.calculated_risk_score), failedWithin90d: raw.failed_within_90d ? Number(raw.failed_within_90d) : undefined }; },
};