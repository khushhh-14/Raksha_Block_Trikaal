import { BlockRequest } from '../types';
import { SECTION_TIMETABLE, TRAIN_MASTER } from '../data/railwayOperations';

export interface StringChartStation { code: string; name: string; kilometer: number; }
export interface StringChartPoint { station: string; arrival: number; departure: number; }
export interface StringChartTrain { trainNumber: string; trainName: string; type: string; priority: string; sectionSpeed: string; points: StringChartPoint[]; }
export interface StringChartBlock { id: string; department: BlockRequest['department']; section: string; start: number; end: number; startStation: string; endStation: string; machine: string; status: BlockRequest['status']; }

const timeToMinutes = (value: string): number => { const [hours, minutes] = (value || '00:00').split(':').map(Number); return Math.max(0, Math.min(1440, (hours || 0) * 60 + (minutes || 0))); };
const sectionStations = (section: string): string[] => section.split('-').map((part) => part.trim().toUpperCase()).filter(Boolean);
const stationName = (code: string): string => ({ DLI: 'Delhi', NDLS: 'New Delhi', DEC: 'Delhi Cantt', GZB: 'Ghaziabad', ALJN: 'Aligarh Jn', TDL: 'Tundla Jn', CNB: 'Kanpur', GGN: 'Gurgaon', MTC: 'Meerut City', PWL: 'Palwal', MTJ: 'Mathura Jn', FDB: 'Faridabad', ST: 'Surat', VAPI: 'Vapi' }[code] || code);

const routeStations = (): StringChartStation[] => {
  const seen = new Set<string>();
  const stations: StringChartStation[] = [];
  SECTION_TIMETABLE.forEach((entry, index) => sectionStations(entry.section).forEach((code) => { if (!seen.has(code)) { seen.add(code); stations.push({ code, name: stationName(code), kilometer: index }); } }));
  return stations;
};

export const parseStringChartData = (requests: BlockRequest[]): { stations: StringChartStation[]; trains: StringChartTrain[]; blocks: StringChartBlock[] } => {
  const stations = routeStations();
  const trains = TRAIN_MASTER.map((master) => {
    const records = SECTION_TIMETABLE.filter((entry) => entry.trainNumber === master.trainNumber);
    const points: StringChartPoint[] = [];
    records.forEach((record) => { const [first, second] = sectionStations(record.section); const from = record.direction === 'DOWN' ? second : first; const to = record.direction === 'DOWN' ? first : second; points.push({ station: from, arrival: timeToMinutes(record.departureTime), departure: timeToMinutes(record.departureTime) }); points.push({ station: to, arrival: timeToMinutes(record.arrivalTime), departure: timeToMinutes(record.departureTime) }); });
    return { trainNumber: master.trainNumber, trainName: master.trainName, type: master.type, priority: master.priorityClass, sectionSpeed: master.type.toLowerCase().includes('freight') ? '75 km/h' : '130 km/h', points };
  }).filter((train) => train.points.length > 0);
  const blocks = requests.filter((request) => ['PENDING', 'APPROVED', 'MODIFIED_APPROVED'].includes(request.status)).map((request) => { const start = timeToMinutes(request.approvedStartTime || request.requestedStartTime); let end = timeToMinutes(request.approvedEndTime || request.requestedEndTime); if (end <= start) end = Math.min(1440, start + Math.max(request.durationMinutes, 15)); return { id: request.id, department: request.department, section: request.section, start, end, startStation: request.stationFrom.split('(').pop()?.replace(')', '').trim() || request.stationFrom, endStation: request.stationTo.split('(').pop()?.replace(')', '').trim() || request.stationTo, machine: request.machineryDeployed.join(', ') || request.machineryText || 'Not allocated', status: request.status }; });
  return { stations, trains, blocks };
};

export const minutesToChartTime = (minutes: number): string => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;