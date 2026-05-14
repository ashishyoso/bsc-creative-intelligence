import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BACKEND_URL = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
).replace(/\/$/, '');
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || '';
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || '';
const MODEL = process.env.CHAT_MODEL || 'claude-sonnet-4-6';

function backendHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (BASIC_AUTH_USER && BASIC_AUTH_PASS) {
    h.authorization = `Basic ${Buffer.from(`${BASIC_AUTH_USER}:${BASIC_AUTH_PASS}`).toString('base64')}`;
  }
  return h;
}

async function backendGet(path: string): Promise<unknown> {
  const r = await fetch(`${BACKEND_URL}${path}`, { headers: backendHeaders(), cache: 'no-store' });
  if (!r.ok) throw new Error(`backend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_skus',
    description: 'List all SKUs that have creative data in the library. Use this first if the user mentions a SKU you do not recognize.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'leaderboard',
    description:
      'Get a ranked leaderboard. Returns rows with metric_value, median, n (sample size), confidence, total_spend. ' +
      'Use this for any "best/worst/top by X" question. Confidence is Insufficient/Weak/Moderate/Strong/Robust based on sample size.',
    input_schema: {
      type: 'object',
      properties: {
        dimension: {
          type: 'string',
          description:
            'What to group by. Common values: sku, format, hook_archetype, persona_implied, audio_language, awareness_stage, brand_visible_first_3s, follows_60pct_rule, talent_type, setting.',
        },
        metric: {
          type: 'string',
          enum: ['roas', 'hook_rate', 'hold_rate', 'ctr', 'spend'],
        },
        sku: { type: 'string', description: 'Optional SKU filter, e.g. "FBT" or "3@999".' },
        min_n: {
          type: 'number',
          description: 'Minimum sample size per row (default 3). Raise to 10+ for high-confidence answers.',
        },
      },
      required: ['dimension', 'metric'],
    },
  },
  {
    name: 'search_assets',
    description:
      'Search the creative library. Returns a list of assets with their performance and tags. Use for "show me ads that…" questions. Default sort is by spend.',
    input_schema: {
      type: 'object',
      properties: {
        sku: { type: 'string' },
        format: { type: 'string' },
        hook_archetype: { type: 'string' },
        audio_language: { type: 'string' },
        persona_implied: { type: 'string' },
        awareness_stage: { type: 'string' },
        brand_visible_first_3s: { type: 'boolean' },
        min_spend: { type: 'number' },
        min_roas: { type: 'number' },
        min_hook_rate: { type: 'number', description: 'As a fraction, e.g. 0.30 for 30%' },
        search: { type: 'string', description: 'Free-text search over ad name / on-screen text / transcript.' },
        sort_by: { type: 'string', enum: ['spend', 'roas', 'hook_rate', 'hold_rate', 'ctr'] },
        limit: { type: 'number', description: 'Default 20, max 100.' },
      },
      required: [],
    },
  },
  {
    name: 'get_asset',
    description: 'Get full detail on a single asset by its asset_id (16-char hex). Use this when the user references a specific creative.',
    input_schema: {
      type: 'object',
      properties: { asset_id: { type: 'string' } },
      required: ['asset_id'],
    },
  },
  {
    name: 'anti_patterns',
    description:
      'List creative attributes that consistently underperform a benchmark on a chosen metric. Use for "what should we avoid" or "what hurts ROAS" questions.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['roas', 'hook_rate', 'hold_rate', 'ctr'] },
        sku: { type: 'string' },
        min_n: { type: 'number', description: 'Default 5.' },
        top_k: { type: 'number', description: 'Default 10.' },
      },
      required: [],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    if (name === 'list_skus') {
      const r = await backendGet('/leaderboards/skus');
      return JSON.stringify(r);
    }
    if (name === 'leaderboard') {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(input)) {
        if (v === undefined || v === null || v === '') continue;
        q.set(k, String(v));
      }
      const r = await backendGet(`/leaderboards?${q.toString()}`);
      return JSON.stringify(r);
    }
    if (name === 'search_assets') {
      const q = new URLSearchParams();
      const limit = Math.min(Number(input.limit ?? 20), 100);
      q.set('limit', String(limit));
      for (const [k, v] of Object.entries(input)) {
        if (k === 'limit') continue;
        if (v === undefined || v === null || v === '') continue;
        q.set(k, String(v));
      }
      const r = (await backendGet(`/assets?${q.toString()}`)) as Array<Record<string, unknown>>;
      const slim = r.map((a) => ({
        asset_id: a.asset_id,
        ad_name: a.primary_ad_name,
        asset_type: a.asset_type,
        sku: a.sku,
        format: a.format,
        hook_archetype: a.hook_archetype,
        persona_implied: a.persona_implied,
        awareness_stage: a.awareness_stage,
        audio_language: a.audio_language,
        spend: a.spend,
        roas: a.roas,
        hook_rate: a.hook_rate,
        hold_rate: a.hold_rate,
        ctr: a.ctr,
        duration_s: a.actual_duration_seconds,
        brand_visible_first_3s: a.brand_visible_first_3s,
      }));
      return JSON.stringify(slim);
    }
    if (name === 'get_asset') {
      const id = String(input.asset_id || '');
      if (!/^[0-9a-f]{8,}$/i.test(id)) return JSON.stringify({ error: 'invalid asset_id' });
      const r = await backendGet(`/assets/${id}`);
      return JSON.stringify(r);
    }
    if (name === 'anti_patterns') {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(input)) {
        if (v === undefined || v === null || v === '') continue;
        q.set(k, String(v));
      }
      const r = await backendGet(`/leaderboards/anti-patterns?${q.toString()}`);
      return JSON.stringify(r);
    }
    return JSON.stringify({ error: `unknown tool ${name}` });
  } catch (e: unknown) {
    return JSON.stringify({ error: String((e as Error).message ?? e) });
  }
}

const SYSTEM_PROMPT = `You are the analytics copilot for the YOSO-BSC Creative Intelligence library — a database of ~1000 Meta ad creatives for Bombay Shaving Company with performance metrics (spend, ROAS, hook rate, hold rate, CTR) and AI-tagged attributes (SKU, format, hook archetype, persona, language, etc).

Your job: answer the user's question using ONLY data fetched via the provided tools. Never fabricate numbers. If you don't have the data, say so.

How to work:
1. Decide which tool(s) to call. For "best/top/worst by X" → leaderboard. For "show me ads that…" → search_assets. For "what to avoid / what hurts X" → anti_patterns. For "tell me about ad XYZ" → get_asset.
2. Call tools, look at the data, then answer concisely.
3. Indian rupees are in raw rupees (₹). Format big numbers as ₹X.XM or ₹X.XK.
4. Always end your answer with a "Confidence:" line — one of: high, medium, low, none.
   - high: large sample (n ≥ 20 per row) or "Robust" confidence from leaderboard, or a direct lookup of a specific asset.
   - medium: "Strong"/"Moderate" leaderboard rows or 10 ≤ n < 20.
   - low: small sample (n < 10) or shaky inference.
   - none: tool returned nothing useful, or the question is outside the data. In this case, say "I don't have enough data to answer that." and stop.
5. If a leaderboard or comparison would benefit from a chart, append a fenced \`chart\` block at the end (after the Confidence line). Format:

\`\`\`chart
{"type":"bar","title":"Top SKUs by ROAS","data":[{"label":"FBT","value":4.2},{"label":"3@999","value":5.97}]}
\`\`\`

Only "bar" charts are supported. Keep to ≤8 bars. Labels short. Values numeric.

6. Cite specific asset_ids in your answer when referring to individual ads (e.g. "[124d786a96880ded]").
7. Keep answers short — 2-5 sentences plus optional bullet list. The user is a creative strategist looking for actionable signal, not a report.`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }
  const { messages } = (await req.json()) as { messages: Array<{ role: 'user' | 'assistant'; content: string }> };
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let step = 0; step < 5; step++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: TOOLS,
      messages: apiMessages,
    });

    const blocks = resp.content;
    apiMessages.push({ role: 'assistant', content: blocks });

    if (resp.stop_reason !== 'tool_use') {
      const text = blocks
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return Response.json({ text, usage: resp.usage });
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const b of blocks) {
      if (b.type !== 'tool_use') continue;
      const out = await runTool(b.name, b.input as Record<string, unknown>);
      toolResults.push({ type: 'tool_result', tool_use_id: b.id, content: out });
    }
    apiMessages.push({ role: 'user', content: toolResults });
  }

  return Response.json({ text: 'I hit my tool-call limit before reaching an answer. Try a more specific question.\n\nConfidence: none' });
}
