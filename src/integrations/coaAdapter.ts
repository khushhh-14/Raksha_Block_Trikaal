import sectionTimetableCsv from '../../data/synthetic/section_timetable.csv?raw';
import trainsMasterCsv from '../../data/synthetic/trains_master.csv?raw';
import { CoaTimetableMovement, GoodsForecast } from './types';

const rows = (raw: string): Record<string, string>[] => { const [header, ...lines] = raw.trim().split(/\r?\n/); const columns = header.split(','); return lines.map((line) => Object.fromEntries(line.split(',').map((value, index) => [columns[index], value]))); };
const timetable = rows(sectionTimetableCsv);
const trains = rows(trainsMasterCsv);

// This adapter stands in for the Control Office Application goods forecast feed.
export const coaAdapter = {
  sourceId: 'COA', sourceName: 'Control Office Application', department: 'OPERATIONS', lastSyncAt: null as string | null, recordCount: 0, status: 'OFFLINE' as 'OFFLINE' | 'CONNECTED' | 'DEGRADED',
  async fetchRecords() { return timetable; },
  normalise(raw: Record<string, string>) { return raw; },
  getScheduledPaths(section: string, date: string): CoaTimetableMovement[] { return timetable.filter((row) => row.section === section && (!date || row.days.split(',').includes(new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()))).map((row) => ({ trainNo: row.train_no, section: row.section, arrivalTime: row.arr_time, departureTime: row.dep_time, direction: row.direction, days: row.days })); },
  getGoodsForecast(section: string, horizonDays: number): GoodsForecast[] { const freight = trains.filter((train) => /goods|freight/i.test(train.type)); return Array.from({ length: horizonDays }, (_, index) => ({ section, date: new Date(Date.now() + index * 86400000).toISOString().slice(0, 10), freightTrainCount: freight.filter((train) => train.days_of_run.split(',').includes(new Date(Date.now() + index * 86400000).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase())).length, confidence: Math.max(0.35, 0.92 - index * 0.08) })); },
};