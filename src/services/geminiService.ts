export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface GeminiChatContext {
  activeRequisitions: unknown[];
  defectsData: unknown[];
  trainMasterSummary: unknown;
  corridorCapacity?: unknown[];
}

export interface GeminiChatResult {
  reply: string;
  /** true when Gemini could not answer and the server used its built-in rule-based fallback */
  degraded: boolean;
  degradedReason?: string;
  model?: string;
}

export async function chatWithAssistant(
  userMessage: string,
  chatHistory: ChatMessage[],
  context: GeminiChatContext,
): Promise<GeminiChatResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch('/api/gemini/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage, history: chatHistory, context }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as {
      reply?: string; error?: string; degraded?: boolean; degradedReason?: string; model?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || `Chat API returned HTTP ${response.status}`);
    }
    if (!payload.reply) throw new Error('Chat API returned an empty response.');
    if (payload.degraded) console.warn('[Raksha-Saarthi] Gemini unavailable, fallback reply used:', payload.degradedReason);
    return {
      reply: payload.reply,
      degraded: Boolean(payload.degraded),
      degradedReason: payload.degradedReason,
      model: payload.model,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The request timed out after 35 seconds. Check the Vercel function logs.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
