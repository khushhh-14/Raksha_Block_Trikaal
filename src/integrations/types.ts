export type SourceStatus = 'CONNECTED' | 'DEGRADED' | 'OFFLINE';

export interface NormalisedDefect {
  defectId: string;
  sourceSystem: string;
  department: string;
  section: string;
  severity: number;
  daysOverdue: number;
  assetAgeYears: number;
  pastFailureCount: number;
  deferredCount: number;
  calculatedRiskScore: number;
  failedWithin90d?: number;
}

export interface SourceAdapter<TRaw = unknown> {
  sourceId: string;
  sourceName: string;
  department: string;
  fetchRecords(): Promise<TRaw[]>;
  normalise(raw: TRaw): NormalisedDefect;
  lastSyncAt: string | null;
  recordCount: number;
  status: SourceStatus;
}

export interface SourceSyncReport {
  sourceId: string;
  recordCount: number;
  lastSyncAt: string | null;
  status: SourceStatus;
}

export interface CoaTimetableMovement {
  trainNo: string;
  section: string;
  arrivalTime: string;
  departureTime: string;
  direction: string;
  days: string;
}

export interface GoodsForecast {
  section: string;
  date: string;
  freightTrainCount: number;
  confidence: number;
}
