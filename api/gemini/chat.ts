import type { IncomingMessage, ServerResponse } from 'node:http';

type ChatMessage = { role: 'user' | 'assistant'; text: string };
type ChatContext = {
  activeRequisitions?: unknown[];
  defectsData?: unknown[];
  trainMasterSummary?: unknown;
  corridorCapacity?: unknown[];
};
type RequisitionSummary = {
  id: string;
  department: string;
  section: string;
  status: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  priority: string;
  mlRisk: string | number;
};

const sendJson = (response: ServerResponse, statusCode: number, payload: Record<string, unknown>): void => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.end(JSON.stringify(payload));
};

const readBody = (request: IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) reject(new Error('Request body is too large.'));
  });
  request.on('end', () => resolve(body));
  request.on('error', reject);
});

const getRequisitions = (context: ChatContext): RequisitionSummary[] =>
  (Array.isArray(context.activeRequisitions) ? context.activeRequisitions : []).map((item) => {
    const request = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      id: String(request.id || ''),
      department: String(request.department || ''),
      section: String(request.section || ''),
      status: String(request.status || ''),
      date: String(request.date || ''),
      startTime: String(request.startTime || ''),
      endTime: String(request.endTime || ''),
      durationMinutes: Number(request.durationMinutes || 0),
      priority: String(request.priority || ''),
      mlRisk: typeof request.mlRisk === 'number' || typeof request.mlRisk === 'string' ? request.mlRisk : 'not scored',
    };
  });

const compactRecords = (records: unknown[], fields: string[], limit: number): string[] => records
  .slice(0, limit)
  .map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return JSON.stringify(Object.fromEntries(fields
      .filter((field) => record[field] !== undefined && record[field] !== null && record[field] !== '')
      .map((field) => [field, record[field]])));
  });

const buildContextSummary = (context: ChatContext, message: string): string => {
  const requisitions = getRequisitions(context);
  // getRequisitions() keeps only a few fields; the model needs the full set (line type, work category, delays...).
  const rawRequisitions = Array.isArray(context.activeRequisitions) ? context.activeRequisitions : [];
  const corridors = Array.isArray(context.corridorCapacity) ? context.corridorCapacity : [];
  const defects = Array.isArray(context.defectsData) ? context.defectsData : [];
  const timetable = context.trainMasterSummary && typeof context.trainMasterSummary === 'object'
    ? context.trainMasterSummary as { trains?: unknown[]; sectionTimetable?: unknown[] }
    : {};
  const trains = Array.isArray(timetable.trains) ? timetable.trains : [];
  const movements = Array.isArray(timetable.sectionTimetable) ? timetable.sectionTimetable : [];
  const query = message.toLowerCase();
  const matchingSections = new Set(requisitions
    .filter((request) => `${request.id} ${request.section}`.toLowerCase().split(/[^a-z0-9-]+/).some((token) => token.length > 2 && query.includes(token)))
    .map((request) => request.section.toLowerCase()));
  const relevantMovements = movements.filter((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const searchable = `${record.section || ''} ${record.trainNumber || ''} ${record.trainName || ''}`.toLowerCase();
    return matchingSections.size > 0
      ? Array.from(matchingSections).some((section) => searchable.includes(section)) || searchable.split(/[^a-z0-9-]+/).some((token) => token.length > 2 && query.includes(token))
      : searchable.split(/[^a-z0-9-]+/).some((token) => token.length > 2 && query.includes(token));
  });
  const relevantTrains = trains.filter((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const searchable = `${record.trainNumber || ''} ${record.trainName || ''}`.toLowerCase();
    return searchable.split(/[^a-z0-9-]+/).some((token) => token.length > 2 && query.includes(token));
  });
  return [
    `Active requisitions (${requisitions.length}):`,
    ...compactRecords(rawRequisitions, ['id', 'department', 'section', 'status', 'date', 'startTime', 'endTime', 'durationMinutes', 'stationFrom', 'stationTo', 'lineType', 'workCategory', 'speedRestrictionKmH', 'priority', 'priorityScore', 'urgencyLevel', 'passengerDelayMins', 'freightDelayMins', 'mlRisk'], 60),
    `Defect/risk records loaded (${defects.length}):`,
    ...compactRecords(defects, ['defectId', 'section', 'department', 'defectType', 'workCategory', 'workDescription', 'speedRestrictionKmH', 'priority', 'urgencyLevel', 'status'], 60),
    `Corridor capacity records (${corridors.length}):`,
    ...compactRecords(corridors, ['section', 'sectionName', 'zoneCode', 'divisionName', 'totalTracks', 'lineType', 'dailyTrainCount', 'capacityHoursUsed', 'maxCapacityHours', 'criticalityTier'], 40),
    `Train master records available: ${trains.length}; matching records for this question:`,
    ...compactRecords(relevantTrains.length > 0 ? relevantTrains : trains, ['trainNumber', 'trainName', 'type', 'source', 'destination', 'priorityClass', 'daysOfRun', 'punctualityPct', 'averagePassengers'], 40),
    `Timetable movements available: ${movements.length}; matching movements for this question:`,
    ...compactRecords(relevantMovements.length > 0 ? relevantMovements : movements, ['trainNumber', 'section', 'arrivalTime', 'departureTime', 'direction', 'days'], 80),
  ].join('\n').slice(0, 45000);
};

const localCopilotReply = (message: string, context: ChatContext): string => {
  const requisitions = getRequisitions(context);
  const lower = message.toLowerCase();
  const matchingRequest = requisitions.find((request) => {
    const tokens = `${request.id} ${request.section}`.toLowerCase().split(/[^a-z0-9-]+/).filter((token) => token.length > 2);
    return tokens.some((token) => lower.includes(token));
  });

  if (matchingRequest) {
    return `Section status: ${matchingRequest.section} (${matchingRequest.id}) is ${matchingRequest.status}. ${matchingRequest.department} has a ${matchingRequest.durationMinutes}-minute window from ${matchingRequest.startTime} to ${matchingRequest.endTime} on ${matchingRequest.date}. Priority: ${matchingRequest.priority}; ML risk: ${matchingRequest.mlRisk}. Check the conflict alert and affected-train panel before authorizing any movement.`;
  }
  if (/\b(hi|hello|hey|namaste|good morning|good evening)\b/.test(lower)) {
    return `Good day, Section Controller. I have ${requisitions.length} active requisition${requisitions.length === 1 ? '' : 's'} on the live board. Ask me about a section, train risk, conflict, or whether P-Way, S&T, and TRD work can be bundled.`;
  }
  if (lower.includes('bundle') || lower.includes('tradeoff') || lower.includes('trade-off')) {
    return 'Bundling recommendation: combine P-Way, S&T, and TRD work only when the section, date, and protection window overlap. The benefit is one coordinated possession; the trade-off is a wider safety envelope, shared isolation planning, and coordinated release checks. Keep independent sections separate.';
  }
  if (lower.includes('train') || lower.includes('risk') || lower.includes('delay') || lower.includes('timetable')) {
    const timetable = context.trainMasterSummary && typeof context.trainMasterSummary === 'object'
      ? context.trainMasterSummary as { trains?: unknown[] }
      : {};
    const trainCount = Array.isArray(timetable.trains) ? timetable.trains.length : 0;
    return `Train-risk summary: ${requisitions.length} active requisitions and ${trainCount} train master records are loaded. Open the delay badge for a requisition to see timetable movements, calculated regulation minutes, mitigation, and section capacity margin.`;
  }
  return `Live board summary: ${requisitions.length} active requisitions are loaded. I can explain section status, train risk, timetable impact, conflict handling, or P-Way/S&T/TRD bundling. No block authority is granted by this assistant.`;
};

// ---------------------------------------------------------------------------
// Gemini call layer
// ---------------------------------------------------------------------------
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Google retires model IDs regularly (gemini-1.5-* and gemini-2.0-flash are already shut down;
// gemini-2.5-flash is scheduled for Oct 2026). Set GEMINI_MODEL in Vercel to override the first choice.
const MODEL_CANDIDATES = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

const cleanKey = (value?: string): string => (value || '').trim().replace(/^['"]|['"]$/g, '');
const getApiKey = (): string => cleanKey(process.env.GEMINI_API_KEY) || cleanKey(process.env.VITE_GEMINI_API_KEY);
const getModels = (): string[] => [cleanKey(process.env.GEMINI_MODEL), ...MODEL_CANDIDATES]
  .filter((model, index, all) => model && all.indexOf(model) === index);

const buildGenerationConfig = (model: string, withThinking: boolean): Record<string, unknown> => {
  // maxOutputTokens also counts hidden "thinking" tokens, so keep plenty of headroom.
  const config: Record<string, unknown> = { maxOutputTokens: 2048 };
  if (!withThinking) return config;
  if (model.startsWith('gemini-3')) config.thinkingConfig = { thinkingLevel: 'low' }; // Gemini 3.x: keep default temperature
  else if (model.startsWith('gemini-2.5')) { config.temperature = 0.3; config.thinkingConfig = { thinkingBudget: 512 }; }
  return config;
};

type GeminiContent = { role: 'user' | 'model'; parts: Array<{ text: string }> };
type AttemptResult = { ok: boolean; reply?: string; status?: number; detail?: string; fatal?: boolean };

// Gemini needs turns that start with "user" and alternate. The browser also sends the greeting bubble and the
// current message inside `history`, so normalise it here.
const buildContents = (history: ChatMessage[] | undefined, message: string): GeminiContent[] => {
  const turns = (Array.isArray(history) ? history : [])
    .filter((item) => item && typeof item.text === 'string' && item.text.trim())
    .map((item) => ({ role: item.role === 'assistant' ? ('model' as const) : ('user' as const), text: String(item.text).slice(0, 4000) }))
    .slice(-10);
  const lastTurn = turns[turns.length - 1];
  if (lastTurn && lastTurn.role === 'user' && lastTurn.text.trim() === message) turns.pop();
  while (turns.length > 0 && turns[0].role !== 'user') turns.shift();
  const merged: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const turn of turns) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === turn.role) previous.text += `\n${turn.text}`;
    else merged.push({ ...turn });
  }
  const previous = merged[merged.length - 1];
  if (previous && previous.role === 'user') previous.text += `\n${message}`;
  else merged.push({ role: 'user', text: message });
  return merged.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));
};

const callGemini = async (
  apiKey: string,
  model: string,
  systemInstruction: string,
  contents: GeminiContent[],
  withThinking: boolean,
  timeoutMs: number,
): Promise<AttemptResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const geminiResponse = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: buildGenerationConfig(model, withThinking),
      }),
    });
    if (!geminiResponse.ok) {
      const detail = (await geminiResponse.text()).slice(0, 600);
      const keyProblem = geminiResponse.status === 401 || geminiResponse.status === 403
        || (geminiResponse.status === 400 && /API_KEY_INVALID|API key not valid|API key expired/i.test(detail));
      return { ok: false, status: geminiResponse.status, detail, fatal: keyProblem };
    }
    const result = await geminiResponse.json() as {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    const reply = result.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || '').join('').trim();
    if (reply) return { ok: true, reply };
    const reason = result.promptFeedback?.blockReason || result.candidates?.[0]?.finishReason || 'no text returned';
    return { ok: false, status: 200, detail: `Empty response (${reason}).`, fatal: false };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, status: 0, detail: aborted ? `Timed out after ${timeoutMs}ms.` : `Network error: ${String(error)}`, fatal: false };
  } finally {
    clearTimeout(timeoutId);
  }
};

// GET /api/gemini/chat  ->  safe health check (never returns the key itself)
const healthCheck = async (response: ServerResponse): Promise<void> => {
  const apiKey = getApiKey();
  const models = getModels();
  if (!apiKey) {
    sendJson(response, 200, { keyConfigured: false, hint: 'Add GEMINI_API_KEY in Vercel > Settings > Environment Variables, then redeploy.' });
    return;
  }
  const base = { keyConfigured: true, keyPrefix: apiKey.slice(0, 3), keyLength: apiKey.length, modelsTried: models };
  try {
    const listResponse = await fetch(`${GEMINI_BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } });
    if (!listResponse.ok) {
      sendJson(response, 200, { ...base, keyValid: false, status: listResponse.status, detail: (await listResponse.text()).slice(0, 400) });
      return;
    }
    const list = await listResponse.json() as { models?: Array<{ name?: string }> };
    const available = new Set((list.models || []).map((item) => String(item.name || '').replace(/^models\//, '')));
    const usable = models.filter((model) => available.has(model));
    sendJson(response, 200, {
      ...base,
      keyValid: true,
      modelsAvailableToThisKey: usable,
      willUse: usable[0] || null,
      warning: usable.length === 0 ? 'None of the configured models are available. Set GEMINI_MODEL to a current model ID.' : undefined,
    });
  } catch (error) {
    sendJson(response, 200, { ...base, keyValid: false, detail: `Could not reach Google: ${String(error)}` });
  }
};

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.end();
    return;
  }
  if (request.method === 'GET') {
    await healthCheck(response);
    return;
  }
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = JSON.parse(await readBody(request)) as { message?: string; history?: ChatMessage[]; context?: ChatContext };
    const message = body.message?.trim() || '';
    const context = body.context || {};
    if (!message || message.length > 2000) {
      sendJson(response, 400, { error: 'Message must be 1-2000 characters' });
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      console.error('[Gemini API Error]: GEMINI_API_KEY is not configured in process.env');
      sendJson(response, 200, {
        reply: localCopilotReply(message, context),
        degraded: true,
        degradedReason: 'GEMINI_API_KEY is not set for this deployment. Add it in Vercel and redeploy.',
      });
      return;
    }

    const systemInstruction = `You are the Gemini Co-Pilot for RAKSHA-BLOCK (TRIKAAL), an Indian Railways engineering-block planning assistant that supports a Section Controller.

CURRENT LIVE BOARD CONTEXT (synthetic demo data):
${buildContextSummary(context, message)}

How to answer:
- Be a genuinely helpful expert assistant. Answer the exact question first, in natural language, then add the key evidence and any safety checks.
- For questions about this board (requisitions, sections, trains, defects, capacity, delays), the context above is the source of truth. Quote real IDs, sections, times and numbers from it.
- For general Indian Railways knowledge (block working, TSR/speed restrictions, possession, OHE/TRD, S&T, P-Way, interlocking, working timetable concepts, GR/SR), answer from general knowledge, and say when you are giving general guidance rather than board data.
- Never invent a train, time, risk score, defect, capacity value, or approval status. If the board does not contain it, say so and say what should be checked.
- Clearly separate facts from recommendations. Recommendations should consider section, date, time window, line type, train movements and each department's protection needs.
- You may explain and advise, but you never grant authority to occupy a line, clear a train, or approve a block. Final authorization rests with the Section Controller and railway rules.
- Formatting: plain text for a small chat window. Short paragraphs or "- " bullets. Use **bold** sparingly. No headings, tables or code blocks. Keep answers focused (usually under 180 words) unless the user asks for detail.`;

    const contents = buildContents(body.history, message);
    const models = getModels();
    const startedAt = Date.now();
    const TOTAL_BUDGET_MS = 24000;
    let lastFailure = 'Gemini did not return a response.';

    outer:
    for (const model of models) {
      for (const withThinking of [true, false]) {
        const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
        if (remaining < 3000) break outer;
        const result = await callGemini(apiKey, model, systemInstruction, contents, withThinking, Math.min(14000, remaining));
        if (result.ok) {
          sendJson(response, 200, { reply: result.reply || '', model });
          return;
        }
        lastFailure = `${model} -> HTTP ${result.status}: ${result.detail}`;
        console.error('[Gemini API Error]:', { model, withThinking, status: result.status, detail: result.detail });
        if (result.fatal) break outer;                 // bad/blocked key: other models will not help
        if (result.status !== 400) break;              // only retry same model without thinkingConfig on HTTP 400
      }
    }

    sendJson(response, 200, {
      reply: localCopilotReply(message, context),
      degraded: true,
      degradedReason: lastFailure,
    });
  } catch (error) {
    console.error('[Gemini API Error]:', error);
    sendJson(response, 200, {
      reply: 'I could not parse that request. Ask about a section, train risk, conflict, or a P-Way/S&T/TRD bundling trade-off.',
      degraded: true,
      degradedReason: String(error),
    });
  }
}
