/**
 * LLM Service — real AI backend for PataFundi (spec §31-32)
 *
 * Wraps z-ai-web-dev-sdk (server-side ONLY — never exposed to the client).
 * Guarantees required by the spec:
 *   - Every call is logged to `ai_events` (input summary, latency, success).
 *   - AI is advisory ONLY: this module can never mutate business data.
 *     High-impact decisions remain explicit human (admin) actions.
 *   - Prompts forbid fabricating database facts; controllers only feed the
 *     model data they are authorized to read.
 *   - Graceful degradation: when the model is unavailable the caller receives
 *     a typed error and can fall back to deterministic heuristics.
 */
import { query } from '../db.js';

let zaiPromise = null;

async function getClient() {
  if (!zaiPromise) {
    zaiPromise = (async () => {
      const mod = await import('z-ai-web-dev-sdk');
      return mod.default.create();
    })().catch((err) => {
      zaiPromise = null; // allow retry on next request
      throw err;
    });
  }
  return zaiPromise;
}

export async function isLLMAvailable() {
  try {
    await getClient();
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the first JSON object/array from a model response. Models often
 * wrap JSON in prose or code fences; this tolerates both.
 */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const openChar = candidate[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Log an AI interaction to ai_events (spec §31: AI events are first-class
 * audit records). Never throws — logging must not break the request.
 */
export async function logAiEvent({ userId, kind, model, jobId = null, disputeId = null, inputSummary, output, latencyMs, success = true, error = null }) {
  try {
    await query(
      `insert into ai_events (user_id, kind, model, job_id, dispute_id, input_summary, output, latency_ms, success, error)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
      [
        userId || null, kind, model || null, jobId, disputeId,
        String(inputSummary || '').slice(0, 500),
        JSON.stringify(output ?? null),
        latencyMs ?? null, success, error ? String(error).slice(0, 500) : null,
      ],
    );
  } catch (err) {
    console.warn('[ai] failed to log ai_event (non-blocking):', err.message);
  }
}

/**
 * Run a chat completion and record it in ai_events.
 * Returns { ok, content, model, latencyMs } or { ok:false, error }.
 */
export async function complete({ userId = null, kind, system, user, jobId = null, disputeId = null, inputSummary = null, maxTokens }) {
  const started = Date.now();
  let client;
  let model = 'glm';
  try {
    client = await getClient();
    const params = {
      messages: [
        { role: 'assistant', content: system },
        { role: 'user', content: user },
      ],
      thinking: { type: 'disabled' },
    };
    if (maxTokens) params.max_tokens = maxTokens;
    const completion = await client.chat.completions.create(params);
    const content = completion?.choices?.[0]?.message?.content || '';
    const latencyMs = Date.now() - started;
    if (!content.trim()) throw new Error('Empty model response');
    await logAiEvent({ userId, kind, model, jobId, disputeId, inputSummary, output: { preview: String(content).slice(0, 2000) }, latencyMs, success: true });
    return { ok: true, content, model, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    await logAiEvent({ userId, kind, model, jobId, disputeId, inputSummary, output: null, latencyMs, success: false, error: err.message });
    return { ok: false, error: err.message, latencyMs };
  }
}

/**
 * Structured completion: asks for JSON, parses defensively.
 * Returns { ok, data, model } — data is the parsed object or null.
 */
export async function completeJSON({ userId, kind, system, user, jobId = null, disputeId = null, inputSummary = null }) {
  const result = await complete({
    userId, kind, system,
    user: `${user}\n\nRespond with valid JSON only — no prose, no markdown fences.`,
    jobId, disputeId, inputSummary,
  });
  if (!result.ok) return result;
  const data = extractJson(result.content);
  if (!data) {
    await logAiEvent({ userId, kind, model: result.model, jobId, disputeId, inputSummary: `${inputSummary || ''} [unparseable]`, output: { raw: String(result.content).slice(0, 2000) }, latencyMs: result.latencyMs, success: false, error: 'model returned unparseable JSON' });
    return { ok: false, error: 'AI response could not be parsed', latencyMs: result.latencyMs };
  }
  return { ok: true, data, model: result.model, latencyMs: result.latencyMs };
}
