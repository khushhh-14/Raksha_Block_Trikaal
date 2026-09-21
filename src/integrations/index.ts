import { coaAdapter } from './coaAdapter';
import { smmsAdapter } from './smmsAdapter';
import { tdmsAdapter } from './tdmsAdapter';
import { tmsAdapter } from './tmsAdapter';
import { NormalisedDefect, SourceSyncReport } from './types';

export async function ingestAll(): Promise<{ defects: NormalisedDefect[]; syncReport: SourceSyncReport[] }> {
  const adapters = [tmsAdapter, smmsAdapter, tdmsAdapter];
  const defects: NormalisedDefect[] = [];
  const syncReport: SourceSyncReport[] = [];
  for (const adapter of adapters) {
    try {
      const records = await adapter.fetchRecords();
      adapter.recordCount = records.length;
      adapter.lastSyncAt = new Date().toISOString();
      adapter.status = 'CONNECTED';
      defects.push(...records.map((record) => adapter.normalise(record)));
    } catch {
      adapter.status = 'DEGRADED';
    }
    syncReport.push({ sourceId: adapter.sourceId, recordCount: adapter.recordCount, lastSyncAt: adapter.lastSyncAt, status: adapter.status });
  }
  const coaRecords = await coaAdapter.fetchRecords();
  coaAdapter.recordCount = coaRecords.length;
  coaAdapter.lastSyncAt = new Date().toISOString();
  coaAdapter.status = 'CONNECTED';
  syncReport.push({ sourceId: coaAdapter.sourceId, recordCount: coaAdapter.recordCount, lastSyncAt: coaAdapter.lastSyncAt, status: coaAdapter.status });
  return { defects, syncReport };
}

export { coaAdapter, smmsAdapter, tdmsAdapter, tmsAdapter };
export * from './types';