import React, { useState } from 'react';
import { LoaderCircle, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { BlockRequest, User } from '../types';
import { chatWithAssistant } from '../services/geminiService';
import { CORRIDOR_CAPACITY, SECTION_TIMETABLE, TRAIN_MASTER } from '../data/railwayOperations';

interface GeminiChatPanelProps {
  currentUser: User;
  allRequests: BlockRequest[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** UI-only bubbles (greeting, errors) are never sent to Gemini as conversation history */
  local?: boolean;
  /** set when the server had to fall back to its rule-based reply */
  degradedReason?: string;
}

// Renders **bold** from Gemini's reply without pulling in a markdown library.
const renderInline = (text: string): React.ReactNode[] =>
  text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
    part.length > 4 && part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  );

export const GeminiChatPanel: React.FC<GeminiChatPanelProps> = ({ currentUser, allRequests }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', local: true, text: 'Ask about section risk, train protection, or a scheduling tradeoff.' },
  ]);

  if (currentUser.role !== 'SECTION_CONTROLLER') return null;

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    const history = messages
      .filter((message) => !message.local && !message.degradedReason)
      .map(({ role, text: messageText }) => ({ role, text: messageText }));
    setMessages([...messages, { role: 'user' as const, text }]);
    setDraft('');
    setIsSending(true);
    try {
      const activeRequisitions = allRequests
        .filter((request) => !['REJECTED', 'COMPLETED'].includes(request.status))
        .map((request) => ({
          id: request.id,
          department: request.department,
          section: request.section,
          date: request.requestedDate,
          status: request.status,
          startTime: request.requestedStartTime,
          endTime: request.requestedEndTime,
          durationMinutes: request.durationMinutes,
          stationFrom: request.stationFrom,
          stationTo: request.stationTo,
          lineType: request.lineType,
          workCategory: request.workCategory,
          speedRestrictionKmH: request.speedRestrictionKmH,
          priority: request.priority,
          priorityScore: request.priorityScore,
          urgencyLevel: request.urgencyLevel,
          passengerDelayMins: request.passengerDelayMins,
          freightDelayMins: request.freightDelayMins,
        }));
      const defectsData = allRequests.map((request) => ({
        defectId: request.defectId || request.id,
        section: request.section,
        department: request.department,
        defectType: request.defectType,
        workCategory: request.workCategory,
        workDescription: request.workDescription,
        speedRestrictionKmH: request.speedRestrictionKmH,
        priority: request.priority,
        urgencyLevel: request.urgencyLevel,
        status: request.status,
      }));
      const trainMasterSummary = {
        trains: TRAIN_MASTER,
        sectionTimetable: SECTION_TIMETABLE,
      };
      const result = await chatWithAssistant(text, history, {
        activeRequisitions,
        defectsData,
        trainMasterSummary,
        corridorCapacity: CORRIDOR_CAPACITY,
      });
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: result.reply, degradedReason: result.degraded ? (result.degradedReason || 'Raksha-Saarthi service unavailable') : undefined },
      ]);
    } catch (error) {
      console.error('Raksha-Saarthi Chat request failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown Gemini service error.';
      setMessages((current) => [...current, { role: 'assistant', local: true, text: `I could not reach Raksha-Saarthi Chat: ${message}` }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="relative z-50">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex min-h-8 items-center gap-1.5 rounded border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-indigo-950 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100"
        title="Open Raksha-Saarthi Chat"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Raksha-Saarthi Chat
      </button>
      {isOpen && (
        <div className="fixed inset-x-3 bottom-3 z-[70] flex h-[min(78dvh,520px)] max-h-[calc(100dvh-1.5rem)] w-auto min-w-0 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl sm:right-4 sm:inset-x-auto sm:bottom-4 sm:h-[min(72dvh,520px)] sm:w-[min(380px,calc(100vw-2rem))]">
          <div className="flex shrink-0 items-center justify-between border-b border-indigo-200 bg-indigo-950 px-3 py-2.5 text-white">
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold"><Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" /> <span className="truncate">Raksha-Saarthi Chat</span></span>
            <button type="button" onClick={() => setIsOpen(false)} className="rounded p-1.5 hover:bg-white/10" title="Close chat" aria-label="Close chat"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 text-xs">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`whitespace-pre-line break-words rounded-md px-2.5 py-2 ${message.role === 'user' ? 'ml-6 bg-indigo-50 text-indigo-950' : 'mr-4 bg-slate-100 text-slate-700'}`}>
                {message.role === 'assistant' ? renderInline(message.text) : message.text}
                {message.degradedReason && (
                  <div className="mt-1.5 border-t border-amber-300 pt-1 text-[10px] leading-snug text-amber-700">
                    Offline fallback answer, Gemini did not respond. {message.degradedReason.slice(0, 180)}
                  </div>
                )}
              </div>
            ))}
            {isSending && <div className="flex items-center gap-1.5 text-slate-400"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Raksha-Saarthi is thinking...</div>}
          </div>
          <form onSubmit={sendMessage} className="flex shrink-0 gap-2 border-t border-slate-200 p-2">
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask the controller assistant..." className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-2 text-xs outline-none focus:border-indigo-500" />
            <button type="submit" disabled={isSending || !draft.trim()} className="shrink-0 rounded bg-indigo-700 p-2.5 text-white disabled:cursor-not-allowed disabled:opacity-40" title="Send message" aria-label="Send message"><Send className="h-3.5 w-3.5" /></button>
          </form>
        </div>
      )}
    </div>
  );
};
