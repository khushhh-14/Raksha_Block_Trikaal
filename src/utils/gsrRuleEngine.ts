import { BlockRequest } from '../types';
import { SectionTimetableRecord } from '../data/railwayOperations';

export interface GSRRuleResult {
  ruleId: string;
  title: string;
  passed: boolean;
  message: string;
  remediation?: string;
}

export interface GSRComplianceResult {
  isCompliant: boolean;
  passedRules: GSRRuleResult[];
  violations: GSRRuleResult[];
}

const minutes = (value: string): number => {
  const [hours, mins] = (value || '00:00').split(':').map(Number);
  return (hours || 0) * 60 + (mins || 0);
};

const normalizedText = (request: BlockRequest): string => [
  request.blockType,
  request.workCategory,
  request.workDescription,
  request.controllerRemarks,
  request.cautionOrderDetails,
].filter(Boolean).join(' ').toLowerCase();

const routeCodes = (value: string): string[] => Array.from(value.toUpperCase().matchAll(/\(([A-Z0-9]+)\)/g)).map((match) => match[1]).concat(value.toUpperCase().split(/[-/]/).map((part) => part.trim()).filter((part) => /^[A-Z0-9]{2,5}$/.test(part)));

const hasConfirmation = (request: BlockRequest, terms: string[]): boolean => {
  const text = normalizedText(request);
  return Boolean(request.safetyChecklistPassed) || terms.some((term) => text.includes(term));
};

export function validateGSRCompliance(blockRequest: BlockRequest, timetable: SectionTimetableRecord[], activeBlocks: BlockRequest[]): GSRComplianceResult {
  const start = minutes(blockRequest.approvedStartTime || blockRequest.requestedStartTime);
  const sectionText = blockRequest.section.toLowerCase();
  const requestRoute = new Set(routeCodes(blockRequest.section));
  const relevantTimetable = timetable.filter((entry) => {
    const timetableRoute = routeCodes(entry.section);
    return entry.section.toLowerCase() === sectionText || sectionText.includes(entry.section.toLowerCase()) || entry.section.toLowerCase().includes(sectionText) || (requestRoute.size === timetableRoute.length && timetableRoute.every((code) => requestRoute.has(code)));
  });
  const preceding = relevantTimetable.map((entry) => ({ entry, departure: minutes(entry.departureTime) })).filter(({ departure }) => departure <= start).sort((a, b) => b.departure - a.departure)[0];
  const headway = preceding ? start - preceding.departure : 1440;
  const headwayRule: GSRRuleResult = preceding && headway < 15
    ? { ruleId: 'GSR-HDW-01', title: 'Headway Clearance', passed: false, message: `Violation: Less than 15 mins headway before Train ${preceding.entry.trainNumber}.`, remediation: 'Shift block window forward until at least 15 minutes after the preceding train clears.' }
    : { ruleId: 'GSR-HDW-01', title: 'Headway Clearance', passed: true, message: `Headway verified at ${Math.max(0, headway)} minutes before block commencement.` };

  const requiresPowerIsolation = blockRequest.department === 'TRD' || /ohe|overhead|traction|tower wagon|crane|heavy lift|tamping|grinding/.test(normalizedText(blockRequest));
  const powerRule: GSRRuleResult = !requiresPowerIsolation || (blockRequest.powerBlockRequired && hasConfirmation(blockRequest, ['power block permit', 'traction isolated', 'ohe isolated', '25kv isolated', 'isolation permit']))
    ? { ruleId: 'GSR-TRD-02', title: '25kV AC Traction Power Isolation', passed: true, message: requiresPowerIsolation ? '25kV OHE cutoff and traction isolation permit confirmed.' : 'Traction power isolation is not required for this work.' }
    : { ruleId: 'GSR-TRD-02', title: '25kV AC Traction Power Isolation', passed: false, message: 'Violation: Required 25kV AC traction power isolation permit is not confirmed.', remediation: 'Obtain and record the TRD power block permit and OHE isolation confirmation before approval.' };

  const touchesPoints = /point|turnout|crossing|interlocking|diamond/.test(normalizedText(blockRequest));
  const signalRule: GSRRuleResult = !touchesPoints || (blockRequest.disconnectionMemoRequired && hasConfirmation(blockRequest, ['point clamp', 'points clamped', 'electronic interlocking', 'interlocking disconnection']))
    ? { ruleId: 'GSR-SNT-03', title: 'Signal Interlocking & Point Clamping', passed: true, message: touchesPoints ? 'Electronic interlocking disconnection and point clamping confirmed.' : 'The block does not touch points or crossings.' }
    : { ruleId: 'GSR-SNT-03', title: 'Signal Interlocking & Point Clamping', passed: false, message: 'Violation: Point/crossing work lacks interlocking disconnection and point-clamping confirmation.', remediation: 'Confirm electronic interlocking disconnection and clamp all affected points with the Station Master.' };

  const sameSection = activeBlocks.filter((active) => active.id !== blockRequest.id && active.section === blockRequest.section && active.status !== 'REJECTED');
  const departments = new Set(sameSection.map((active) => active.department).concat(blockRequest.department));
  const aligned = sameSection.every((active) => active.startKm === blockRequest.startKm && active.endKm === blockRequest.endKm && active.lineType === blockRequest.lineType);
  const shadowRule: GSRRuleResult = departments.size < 2 || (blockRequest.shadowBlockEligible && aligned)
    ? { ruleId: 'GSR-SHD-04', title: 'Shadow Block Alignment', passed: true, message: departments.size < 2 ? 'No multi-department shadow block alignment is required.' : 'All departments share the same isolation zone and safety margins.' }
    : { ruleId: 'GSR-SHD-04', title: 'Shadow Block Alignment', passed: false, message: 'Violation: Multi-department work is not aligned to one isolation zone and safety margin.', remediation: 'Align department block requests to identical section, KM limits, line, and safety margins before approval.' };

  const needsTSR = Boolean(blockRequest.trafficBlockRequired || blockRequest.speedRestrictionKmH);
  const tsrRule: GSRRuleResult = !needsTSR || Boolean(blockRequest.cautionOrderDetails)
    ? { ruleId: 'GSR-PSR-05', title: 'Speed Restriction Buffer', passed: true, message: 'TSR/caution notice is available for adjacent running lines.' }
    : { ruleId: 'GSR-PSR-05', title: 'Speed Restriction Buffer', passed: false, message: 'Violation: No temporary speed restriction caution notice is attached.', remediation: 'Issue and attach a TSR caution notice for adjacent running lines before dispatch.' };

  const rules = [headwayRule, powerRule, signalRule, shadowRule, tsrRule];
  return { isCompliant: rules.every((rule) => rule.passed), passedRules: rules.filter((rule) => rule.passed), violations: rules.filter((rule) => !rule.passed) };
}