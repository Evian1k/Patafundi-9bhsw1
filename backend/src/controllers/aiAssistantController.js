/**
 * AI Assistant Controller (spec §31-32) — REAL LLM features for PataFundi.
 *
 * Three capabilities, all advisory-only:
 *   1. analyzeJob        — customer describes a problem; AI suggests category,
 *                          urgency, follow-up questions and an estimate range.
 *                          Clearly labelled ESTIMATES, never guarantees.
 *   2. summarizeDispute  — admin AI: summarises a dispute from server-fetched,
 *                          authorized data. NEVER decides outcomes.
 *   3. improveProfile    — fundi/company AI: profile & service description help.
 *
 * Guardrails (spec §32):
 *   - No endpoint here can mutate business data (no state changes at all).
 *   - Every LLM call is logged to ai_events with actor, latency and outcome.
 *   - Data fed to the model is fetched server-side after authorization.
 *   - When the model is unavailable, deterministic heuristics are used and
 *     clearly labelled (`engine: 'heuristic'`) — the UI must not pretend.
 */
import { query } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { complete, completeJSON, isLLMAvailable } from '../services/llmService.js';

// Deterministic fallback: keyword → category map. Used only when the LLM is
// unavailable, and always reported with engine:'heuristic'.
const KEYWORD_CATEGORIES = [
  ['plumbing', ['leak', 'tap', 'pipe', 'toilet', 'sink', 'drain', 'water', 'burst', 'blocked']],
  ['electrical', ['power', 'socket', 'wiring', 'electric', 'light', 'switch', 'tripping', 'socket']],
  ['cleaning', ['clean', 'mess', 'dust', 'deep clean', 'move out', 'sofa', 'carpet']],
  ['ac_hvac', ['ac', 'aircon', 'air condition', 'cooling', 'heater', 'hvac', 'not cooling']],
  ['mechanic', ['car', 'engine', 'brake', 'battery', 'tyre', 'tire', 'vehicle', 'motorcycle']],
  ['construction', ['build', 'tile', 'roof', 'wall', 'plaster', 'concrete', 'renovat']],
  ['painting', ['paint', 'repaint', 'wall crack', 'primer']],
  ['carpentry', ['door', 'cabinet', 'wardrobe', 'wood', 'furniture', 'shelf', 'lock']],
  ['appliance_repair', ['fridge', 'washing machine', 'microwave', 'oven', 'appliance', 'stove']],
  ['landscaping', ['garden', 'lawn', 'hedge', 'tree', 'landscape', 'grass']],
  ['moving', ['move', 'relocate', 'truck', 'furniture transport', 'movers']],
  ['security', ['cctv', 'camera', 'alarm', 'gate', 'electric fence', 'security']],
  ['beauty', ['hair', 'nails', 'makeup', 'braids', 'massage', 'beauty']],
  ['it_computer', ['laptop', 'computer', 'pc', 'virus', 'software', 'wifi', 'network', 'printer']],
];

function heuristicAnalyze(description) {
  const text = String(description || '').toLowerCase();
  let category = 'other';
  let bestHits = 0;
  for (const [cat, words] of KEYWORD_CATEGORIES) {
    const hits = words.filter((w) => text.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      category = cat;
    }
  }
  const urgentWords = ['urgent', 'asap', 'emergency', 'burst', 'flooding', 'sparks', 'smoke', 'no power', 'today'];
  const urgency = urgentWords.some((w) => text.includes(w)) ? 'high' : 'normal';
  return {
    engine: 'heuristic',
    category,
    urgency,
    suggestedProviderType: category === 'cleaning' || category === 'moving' ? 'company' : 'fundi',
    questions: [
      'When did the problem start?',
      'Have you tried fixing it already?',
      'Is the area accessible right now?',
    ],
    improvedDescription: String(description || '').trim(),
    estimateRange: null,
    disclaimers: ['Basic keyword analysis — full AI analysis is temporarily unavailable.'],
  };
}

async function knownCategories() {
  try {
    const result = await query(
      `select distinct unnest(skills) as category from fundis where approval_status = 'approved'
       union select distinct service_category from jobs where service_category is not null`,
    );
    const cats = result.rows.map((r) => String(r.category)).filter((c) => c && c.length < 60);
    return cats.length ? cats.slice(0, 60) : null;
  } catch {
    return null;
  }
}

export async function analyzeJob(req, res) {
  const description = String(req.body?.description || '').trim();
  if (description.length < 8) throw badRequest('Describe the problem in at least a few words');
  if (description.length > 2000) throw badRequest('Description is too long (2000 characters max)');

  const categories = await knownCategories();
  const categoryHint = categories ? `Known service categories on this platform: ${categories.join(', ')}.` : '';
  const system = [
    'You are PataFundi Assist, the intake analyst for a home-services marketplace (Kenya; currency KES).',
    'Given a customer\'s problem description you classify it so the right professionals can be matched.',
    categoryHint,
    'Rules:',
    '- category MUST be one of the known categories when any plausibly fits; otherwise "other".',
    '- urgency: "emergency" (immediate danger/damage), "high" (same day), or "normal".',
    '- suggestedProviderType: "fundi" (individual professional) or "company" (team/equipment jobs).',
    '- questions: 2-4 short clarifying questions a professional would need answered.',
    '- improvedDescription: a clearer 1-2 sentence rewrite of the customer description. NEVER invent facts.',
    '- estimateRange: {min, max} in KES using typical Nairobi market rates, or null when unknowable. It is an ESTIMATE, never a quote.',
    'Respond with JSON only, shape: {"category":string,"urgency":string,"suggestedProviderType":string,"questions":string[],"improvedDescription":string,"estimateRange":{"min":number,"max":number}|null}',
  ].filter(Boolean).join('\n');

  const ai = await completeJSON({
    userId: req.user.id,
    kind: 'analyze_job',
    system,
    user: description,
    inputSummary: description.slice(0, 300),
  });

  if (!ai.ok || !ai.data || !ai.data.category) {
    const fallback = heuristicAnalyze(description);
    return res.json({
      success: true,
      analysis: fallback,
      engine: 'heuristic',
      disclaimer: 'AI suggestions are automated estimates to help describe your request — they are NOT quotes or guarantees. A professional confirms the real price.',
    });
  }

  const d = ai.data;
  // Never trust the model blindly: coerce output into safe shapes.
  const analysis = {
    engine: 'llm',
    category: String(d.category).toLowerCase().replace(/[^a-z_]/g, '').slice(0, 40),
    urgency: ['emergency', 'high', 'normal'].includes(d.urgency) ? d.urgency : 'normal',
    suggestedProviderType: d.suggestedProviderType === 'company' ? 'company' : 'fundi',
    questions: Array.isArray(d.questions) ? d.questions.map((q) => String(q).slice(0, 200)).slice(0, 4) : [],
    improvedDescription: String(d.improvedDescription || description).slice(0, 1000),
    estimateRange:
      d.estimateRange && Number(d.estimateRange.min) > 0 && Number(d.estimateRange.max) >= Number(d.estimateRange.min)
        ? { min: Math.round(Number(d.estimateRange.min)), max: Math.round(Number(d.estimateRange.max)) }
        : null,
    disclaimers: ['AI suggestions are automated estimates — not quotes or guarantees. The assigned professional confirms the final price.'],
  };
  res.json({ success: true, analysis, engine: 'llm', disclaimer: analysis.disclaimers[0] });
}

export async function summarizeDispute(req, res) {
  const disputeId = String(req.body?.disputeId || '');
  if (!disputeId) throw badRequest('disputeId is required');
  const disputeRes = await query('select * from disputes where id = $1', [disputeId]);
  const dispute = disputeRes.rows[0];
  if (!dispute) throw notFound('Dispute not found');

  // Server-side authorized data pull — the model only sees what admin may see.
  const jobRes = await query('select id, service_category, description, status, final_price, estimated_price, provider_type, company_id from jobs where id = $1', [dispute.job_id]);
  const timeline = await query(
    `select event_type, actor_role, metadata, created_at from job_timeline where job_id = $1 order by created_at asc limit 40`,
    [dispute.job_id],
  ).catch(() => ({ rows: [] }));
  const messages = await query(
    `select u.role as sender_role, cm.body, cm.created_at
     from chat_messages cm join users u on u.id = cm.sender_id
     where cm.job_id = $1 and cm.body is not null
     order by cm.created_at asc limit 40`,
    [dispute.job_id],
  ).catch(() => ({ rows: [] }));

  const dossier = {
    dispute: {
      reason: dispute.reason,
      status: dispute.status,
      opened_by: dispute.opened_by ? 'participant' : 'unknown',
      evidence_count: (dispute.evidence_urls || []).length || 0,
      refund_amount_so_far: dispute.refund_amount || 0,
      resolution: dispute.resolution || undefined,
    },
    job: jobRes.rows[0] || null,
    timeline: timeline.rows.map((t) => ({ event: t.event_type, by: t.actor_role, at: t.created_at })),
    messages: messages.rows.map((m) => ({ from: m.sender_role, text: String(m.body || '').slice(0, 300) })),
  };

  const system = [
    'You are the dispute-triage analyst for PataFundi platform ADMINISTRATORS.',
    'Summarise the dispute dossier faithfully. NEVER fabricate facts that are not in the dossier.',
    'You are advisory only: you do NOT decide outcomes, refunds or penalties — the human admin decides.',
    'Respond with JSON only, shape: {"summary":string,"keyPoints":string[],"policyConsiderations":string[],"suggestedNextSteps":string[],"riskLevel":"low"|"medium"|"high"}',
  ].join('\n');

  const ai = await completeJSON({
    userId: req.user.id,
    kind: 'dispute_summary',
    system,
    user: JSON.stringify(dossier, null, 1).slice(0, 12000),
    jobId: dispute.job_id,
    disputeId,
    inputSummary: `dispute ${disputeId} reason=${dispute.reason}`,
  });

  if (!ai.ok || !ai.data || !ai.data.summary) {
    // Honest degraded mode: return a deterministic digest, clearly labelled.
    const digest = {
      engine: 'digest',
      summary: `Dispute ${disputeId} (${dispute.reason}) on job ${dispute.job_id}. Status: ${dispute.status}. ${dossier.timeline.length} timeline events on record.`,
      keyPoints: [
        `Reason: ${dispute.reason}`,
        `Job status: ${dossier.job?.status || 'unknown'}`,
        `Dispute status: ${dispute.status}`,
      ],
      policyConsiderations: [],
      suggestedNextSteps: ['Review the evidence files and job timeline in the dispute detail view.'],
      riskLevel: 'medium',
      note: 'AI summarization is temporarily unavailable — this is a raw digest, not an AI summary.',
    };
    return res.json({ success: true, summary: digest, engine: 'digest' });
  }

  const d = ai.data;
  const summary = {
    engine: 'llm',
    summary: String(d.summary).slice(0, 4000),
    keyPoints: Array.isArray(d.keyPoints) ? d.keyPoints.map((k) => String(k).slice(0, 300)).slice(0, 8) : [],
    policyConsiderations: Array.isArray(d.policyConsiderations) ? d.policyConsiderations.map((k) => String(k).slice(0, 300)).slice(0, 6) : [],
    suggestedNextSteps: Array.isArray(d.suggestedNextSteps) ? d.suggestedNextSteps.map((k) => String(k).slice(0, 300)).slice(0, 6) : [],
    riskLevel: ['low', 'medium', 'high'].includes(d.riskLevel) ? d.riskLevel : 'medium',
    disclaimers: ['AI-generated summary for investigation support only — it does NOT decide the outcome. All decisions remain with the administrator.'],
  };
  res.json({ success: true, summary, engine: 'llm' });
}

export async function improveProfile(req, res) {
  const text = String(req.body?.text || '').trim();
  const kind = req.body?.kind === 'company' ? 'company' : 'fundi';
  if (text.length < 20) throw badRequest('Provide at least a sentence of profile text to improve');
  if (text.length > 3000) throw badRequest('Profile text is too long (3000 characters max)');

  const system = kind === 'company'
    ? 'You improve service-company profiles for PataFundi, a home-services marketplace. Rewrite the given business description to be clear, trustworthy and specific (max 140 words). Keep every factual claim the user wrote — do NOT invent certifications, staff counts, years of experience or clients. Return JSON: {"improved":string,"tips":string[]}.'
    : 'You improve professional profiles for PataFundi, a home-services marketplace. Rewrite the given professional bio to be clear, trustworthy and specific (max 120 words). Keep every factual claim the user wrote — do NOT invent certifications, years of experience or clients. Return JSON: {"improved":string,"tips":string[]}.';

  const ai = await completeJSON({
    userId: req.user.id,
    kind: 'profile_improve',
    system,
    user: text,
    inputSummary: `profile_${kind} ${text.slice(0, 200)}`,
  });

  if (!ai.ok || !ai.data || !ai.data.improved) {
    res.status(503).json({
      success: false,
      message: 'AI writing help is temporarily unavailable. Your profile text was not changed — please try again shortly.',
    });
    return;
  }
  res.json({
    success: true,
    improved: String(ai.data.improved).slice(0, 3000),
    tips: Array.isArray(ai.data.tips) ? ai.data.tips.map((t) => String(t).slice(0, 200)).slice(0, 5) : [],
    disclaimer: 'AI-suggested text — review every line before saving. It can make mistakes.',
  });
}

export async function aiStatus(_req, res) {
  const available = await isLLMAvailable();
  res.json({ success: true, available });
}
