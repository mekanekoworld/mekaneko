// MEKANEKO agent API (local server; later a Cloudflare Worker). Mounted by dashboard/serve.mjs under /api/.
//   GET  /api/agents/status          -> { online, model }
//   POST /api/agents/chat            -> Server-Sent Events: meta, text, tool, card, done, error
//        body { agent, conversation?, message, lang }
//   GET  /api/market/trending|new    -> Robinhood Chain pools (GeckoTerminal, cached)
//   GET  /api/chain/status           -> chain health
//   GET  /api/market/token?address=  -> one token's live market data (DexScreener)
//   GET  /api/nekopult/draft?id=     -> a launch draft made by NISHIKI
//   GET  /api/record, /api/seal/...  -> The Record (report cards per agent) and the Seal (signed receipts), see ledger.mjs
// The Anthropic API key is read from ANTHROPIC_API_KEY or from "<tools>/.anthropic_key" (never sent to the browser).
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { AGENTS, MODEL, agentSystem, liveFacts } from './agents.mjs';
import { TOOLS, validate, market } from './tools.mjs';
import * as ledger from './ledger.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS_ROOT = join(HERE, '..', '..');
const DATA = join(HERE, 'data');
const KEY_FILE = join(TOOLS_ROOT, '.anthropic_key');
ledger.start(DATA);
// USD per million tokens (OpenRouter's list = Anthropic's prices, checked 2026-11-24) and per web search/fetch call
const PRICES = { opus: { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 }, sonnet: { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  haiku: { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 } };
const WEB_CALL_USD = 0.01;
const priceOf = (model) => PRICES[/haiku/.test(model) ? 'haiku' : /sonnet/.test(model) ? 'sonnet' : 'opus'];
// Public limits (2026-11-24, user decision): questions per person per day (Discord level 10+ gets more, sent by the bot) and a
// daily budget for everyone together; both reset at 00:00 UTC. People are counted by a daily-salted hash, never a raw IP or id.
const DAILY_QUESTIONS = Number(process.env.MK_DAILY_QUESTIONS || 5);
const DAILY_BUDGET = Number(process.env.MK_DAILY_BUDGET_USD || 2);
const MAX_CONV = 30;                                                     // messages in one chat before "start a new chat"
const MAX_TURNS = 10;

const WEB = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 }];
const CODE = [{ type: 'code_execution_20260521', name: 'code_execution' }];
const ASK = { name: 'ask_agent', description: 'Ask another MEKANEKO agent to do part of the work; returns their answer. Call several in one turn when the parts are independent.',
  input_schema: { type: 'object', additionalProperties: false, required: ['agent', 'question'],
    properties: { agent: { type: 'string', enum: Object.keys(AGENTS).filter((a) => a !== 'ryujin') }, question: { type: 'string' } } } };

// Two ways to reach Claude: the Anthropic API (ANTHROPIC_API_KEY or .anthropic_key) or OpenRouter (OPENROUTER_API_KEY or
// .openrouter_key, saved by dashboard/set-openrouter-key.command). Anthropic wins when both are set, unless MK_AI_PROVIDER=openrouter.
// OpenRouter speaks the same Messages format at https://openrouter.ai/api (Bearer auth). Differences handled below: its own web
// search/fetch server tools, no code sandbox (UKKI writes code but cannot run it), no Anthropic betas or server-side fallback.
const OR_KEY_FILE = join(TOOLS_ROOT, '.openrouter_key');
const OR_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-5.5';                  // the public agents' model (user decision 2026-11-24)
const OR_WEB = [{ type: 'openrouter:web_search', parameters: { max_results: 5, max_uses: 5 } }, { type: 'openrouter:web_fetch', parameters: { max_uses: 4 } }];
const NO_SANDBOX = '\n\nCode execution is not available right now. Write the code and explain what it does and how to run it, but never say you ran it or show output you did not get.';
const readKey = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim() : '');
function provider() {
  const a = process.env.ANTHROPIC_API_KEY || readKey(KEY_FILE);
  if (a && process.env.MK_AI_PROVIDER !== 'openrouter') return { name: 'anthropic', key: a };
  const o = process.env.OPENROUTER_API_KEY || readKey(OR_KEY_FILE);
  return o ? { name: 'openrouter', key: o } : null;
}
function apiKey() { return provider()?.key || ''; }
let client = null, clientKey = '';
function getClient() {
  const p = provider(); if (!p) return null;
  const id = `${p.name}:${p.key}`;
  if (!client || clientKey !== id) {
    client = p.name === 'openrouter'
      ? new Anthropic({ baseURL: 'https://openrouter.ai/api', authToken: p.key, defaultHeaders: { 'HTTP-Referer': 'https://mekaneko.com', 'X-OpenRouter-Title': 'MEKANEKO' } })
      : new Anthropic({ apiKey: p.key });
    client.mkProvider = p.name; clientKey = id;
  }
  return client;
}
const modelNow = () => (getClient()?.mkProvider === 'openrouter' ? OR_MODEL : MODEL);
const convs = new Map();                                                // conversation id -> { agent, messages }

const QUOTA_FILE = join(DATA, 'quota.json');
let quota = (() => { try { return JSON.parse(readFileSync(QUOTA_FILE, 'utf8')); } catch { return {}; } })();
function quotaToday() {
  const day = new Date().toISOString().slice(0, 10);
  if (quota.day !== day) quota = { day, spent: 0, users: {} };
  return quota;
}
function saveQuota() {
  try { mkdirSync(DATA, { recursive: true }); writeFileSync(QUOTA_FILE + '.tmp', JSON.stringify(quota)); renameSync(QUOTA_FILE + '.tmp', QUOTA_FILE); } catch {}
}
// who is asking: our Discord bot sends x-mk-user ("discord:<id>"); browsers cannot (the Cloudflare middleware strips every x-mk-*
// header, and the VPS answers only requests carrying the proxy secret). Otherwise the visitor's IP from the middleware.
function whoAsks(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const id = String(req.headers['x-mk-user'] || '') || `ip:${ip}`;
  return createHash('sha256').update(`${quotaToday().day}|${process.env.MK_PROXY_SECRET || 'local'}|${id}`).digest('hex').slice(0, 16);
}
const isInternal = (req) => !!req.headers['x-mk-internal'] && !req.headers['cf-ray'] && !req.headers['cf-connecting-ip']
  && /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket?.remoteAddress || '');
const limitFor = (req) => Math.min(Math.max(Number(req.headers['x-mk-limit']) || DAILY_QUESTIONS, 1), 20);

function toolsFor(id, or) {
  const names = AGENTS[id].tools, eager = or ? {} : { eager_input_streaming: true };       // OpenRouter's tool schema has no eager_input_streaming
  return [
    ...names.filter((n) => TOOLS[n]).map((n) => ({ ...TOOLS[n].def, ...eager })),
    ...(names.includes('ask_agent') ? [{ ...ASK, ...eager }] : []),
    ...(names.includes('web') ? (or ? OR_WEB : WEB) : []), ...(names.includes('code') && !or ? CODE : []),
  ];
}

async function runTool(use, ctx) {
  const def = use.name === 'ask_agent' ? ASK : TOOLS[use.name]?.def;
  if (!def) return { is_error: true, content: `unknown tool ${use.name}` };
  const bad = validate(def, use.input);
  if (bad) return { is_error: true, content: `invalid input: ${bad}` };
  try {
    if (use.name === 'ask_agent') {
      const sub = use.input.agent;
      ctx.tool('ask_agent', 'start', AGENTS[sub].name);
      const out = await runAgent(sub, [{ role: 'user', content: use.input.question }], { ...ctx, agent: sub, nested: true, text: () => {},
        tool: (n, s, label) => ctx.tool(n, s, `${AGENTS[sub].name}${label ? ' · ' + label : ''}`) });
      ctx.tool('ask_agent', 'done', AGENTS[sub].name);
      return { content: out.text || '(no answer)' };
    }
    const result = await TOOLS[use.name].run(use.input, ctx);
    return { content: JSON.stringify(result).slice(0, 24000) };
  } catch (e) {
    return { is_error: true, content: `tool failed: ${e.message}` };
  }
}

function costOf(u) {
  const P = priceOf(modelNow());
  return (u.in * P.in + u.out * P.out + u.cacheRead * P.cacheRead + u.cacheWrite * P.cacheWrite) / 1e6 + (u.web || 0) * WEB_CALL_USD;
}

// one agent turn-loop: streams text to ctx.text, tool progress to ctx.tool, cards to ctx.emit
async function runAgent(id, messages, ctx) {
  const c = getClient(); const or = c.mkProvider === 'openrouter'; const tools = toolsFor(id, or);
  let cfg = {}; try { cfg = JSON.parse(readFileSync(join(ctx.siteRoot || '', 'mekaneko', 'config.json'), 'utf8')); } catch {}
  const system = agentSystem(id, liveFacts(cfg)) + (or && AGENTS[id].tools.includes('code') ? NO_SANDBOX : '');
  let jsonRetries = 0, text = '';
  for (let turn = 0; turn < MAX_TURNS && !ctx.closed(); turn++) {
    const req = {
      model: or ? OR_MODEL : MODEL,
      max_tokens: or ? 16000 : 64000,                                           // OpenRouter reserves credit for max_tokens up front
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      cache_control: { type: 'ephemeral' },
      output_config: { effort: ctx.nested ? 'low' : AGENTS[id].effort },
      ...(tools.length ? { tools } : {}), messages,
    };
    if (!or) Object.assign(req, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });   // Anthropic only: a declined request is re-run on the fallback model
    const stream = c.beta.messages.stream(req);
    ctx.onAbort(() => stream.abort());
    let msg;
    try {
      for await (const ev of stream) {
        if (ev.type === 'content_block_start' && (ev.content_block.type === 'tool_use' || ev.content_block.type === 'server_tool_use')) {
          if (ev.content_block.type === 'server_tool_use') ctx.usage.web++;
          ctx.tool(ev.content_block.name, 'start');
        }
        else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; ctx.text(ev.delta.text); }
      }
      msg = await stream.finalMessage(); jsonRetries = 0;
    } catch (e) {
      if (e instanceof Anthropic.APIError || ctx.closed() || jsonRetries++ >= 2) throw e;
      continue;                                                                 // tool input not parseable: re-issue the turn
    }
    const u = msg.usage || {};
    ctx.usage.in += u.input_tokens || 0; ctx.usage.out += u.output_tokens || 0;
    ctx.usage.cacheRead += u.cache_read_input_tokens || 0; ctx.usage.cacheWrite += u.cache_creation_input_tokens || 0;
    messages.push({ role: 'assistant', content: msg.content });                 // full content: thinking / fallback / server-tool blocks stay
    if (msg.stop_reason === 'pause_turn') continue;
    if (msg.stop_reason === 'refusal') { const t = '\n\n_(This request was declined.)_'; text += t; ctx.text(t); break; }
    const uses = msg.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) break;
    if (msg.stop_reason === 'max_tokens') throw new Error('a tool call was cut off (max_tokens)');
    const results = await Promise.all(uses.map(async (use) => {
      const r = await runTool(use, ctx); ctx.tool(use.name, r.is_error ? 'error' : 'done');
      return { type: 'tool_result', tool_use_id: use.id, content: r.content, ...(r.is_error ? { is_error: true } : {}) };
    }));
    messages.push({ role: 'user', content: results });                          // all results in one message
    text += '\n\n';
  }
  return { text: text.trim() };
}

// ---------------------------------------------------------------- http
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); }
function readBody(req) {
  return new Promise((ok, bad) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 64_000) bad(new Error('body too large')); }); req.on('end', () => ok(s)); req.on('error', bad); });
}

// The website's agent console stays closed ("coming soon") until the $MEKANEKO holder gate (100 $MEKANEKO) is live; the Claude key on the VPS is for the
// Discord agents only. MK_WEB_AGENTS=open reopens it (local testing).
const WEB_OPEN = process.env.MK_WEB_AGENTS === 'open';

export async function handle(req, res, url, siteRoot) {
  const p = url.pathname;
  try {
    if (p === '/api/agents/status') {
      const Q = quotaToday(), limit = limitFor(req);
      return json(res, 200, { online: WEB_OPEN && !!apiKey(), gate: WEB_OPEN ? null : 'holders', limit, left: Math.max(0, limit - (Q.users[whoAsks(req)] || 0)), resting: Q.spent >= DAILY_BUDGET });
    }
    if (p === '/api/market/trending') return json(res, 200, await market.trending(12));
    if (p === '/api/market/new') return json(res, 200, await market.newest(12));
    if (p === '/api/chain/status') return json(res, 200, await TOOLS.chain_status.run({}));
    if (p === '/api/market/token') {
      const a = url.searchParams.get('address') || '';
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return json(res, 400, { error: 'address required' });
      return json(res, 200, await TOOLS.market_token.run({ address: a }));
    }
    if (p === '/api/nekopult/draft') {
      const f = join(DATA, 'drafts.json'); const all = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
      const d = all[url.searchParams.get('id') || '']; return d ? json(res, 200, d) : json(res, 404, { error: 'draft not found' });
    }
    if (p === '/api/agents/chat' && req.method === 'POST') return chat(req, res, siteRoot);
    // Discord /check: SHURU's full Gate check with a receipt, for our own bot only
    if (p === '/api/shuru/check' && req.method === 'POST') {
      if (!isInternal(req)) return json(res, 403, { error: 'forbidden' });
      let b; try { b = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' }); }
      if (!/^0x[0-9a-fA-F]{40}$/.test(String(b.token || ''))) return json(res, 400, { error: 'token required' });
      return json(res, 200, await TOOLS.gate_check.run({ token: b.token }, { agent: 'shuru', source: 'discord', lang: 'en' }));
    }
    if (p.startsWith('/api/record') || p.startsWith('/api/seal') || p.startsWith('/api/watchfire')) {
      ledger.site(siteRoot);
      let body = null;
      if (req.method === 'POST') { try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' }); } }
      const out = await ledger.route(p, req.method, url.searchParams, body, isInternal(req));
      return json(res, out.status || 200, out.body);
    }
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 502, { error: e.message });
  }
}

async function chat(req, res, siteRoot) {
  if (!WEB_OPEN) return json(res, 403, { error: 'coming_soon' });
  let body; try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' }); }
  const agent = String(body.agent || ''); const message = String(body.message || '').trim().slice(0, 8000);
  const lang = body.lang === 'ja' ? 'ja' : 'en';
  if (!AGENTS[agent] || !message) return json(res, 400, { error: 'agent and message are required' });
  if (!getClient()) return json(res, 503, { error: 'offline', detail: 'No AI key on this server yet.' });
  let id = String(body.conversation || '');
  if (!convs.has(id) || convs.get(id).agent !== agent) {
    id = randomBytes(8).toString('hex'); convs.set(id, { agent, messages: [] });
    while (convs.size > 3000) convs.delete(convs.keys().next().value);       // forget the oldest chats (memory only)
  }
  const conv = convs.get(id);
  const ja = lang === 'ja', Q = quotaToday(), me = whoAsks(req), limit = limitFor(req);
  if (Q.spent >= DAILY_BUDGET) return json(res, 429, { code: 'budget', error: ja
    ? 'エージェントたちは今日の分を使い切って休憩中です。00:00 UTC に戻ってきます。ニャン〜'
    : 'The agents have used up today’s budget and are resting until 00:00 UTC. Nyan~ Come back tomorrow!' });
  if ((Q.users[me] || 0) >= limit) return json(res, 429, { code: 'limit', error: ja
    ? `今日の質問 ${limit} 回を使い切りました。00:00 UTC にリセットされます。ニャン〜`
    : `You have used your ${limit} free questions for today. They refill at 00:00 UTC. Nyan~` });
  if (conv.messages.length >= MAX_CONV) return json(res, 400, { code: 'long', error: ja ? 'この会話は長くなりました。新しいチャットを始めてください。' : 'This chat is getting long. Please start a new chat.' });
  Q.users[me] = (Q.users[me] || 0) + 1; saveQuota();

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (ev, data) => { if (!res.writableEnded) res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); };
  let closed = false; const aborts = [];
  req.on('close', () => { closed = true; aborts.forEach((f) => f()); });
  const ctx = { lang, siteRoot, dataDir: DATA, agent, source: String(req.headers['x-mk-user'] || '').startsWith('discord:') ? 'discord' : 'web', usage: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, web: 0 },
    closed: () => closed, onAbort: (f) => aborts.push(f),
    text: (d) => send('text', { d }), tool: (name, state, label) => send('tool', { name, state, label }), emit: (card) => send('card', card) };
  send('meta', { conversation: id, agent });

  const before = conv.messages.length;
  conv.messages.push({ role: 'user', content: message });
  try {
    await runAgent(agent, conv.messages, ctx);
    const cost = costOf(ctx.usage);
    Q.spent += cost; saveQuota(); ledger.answered(agent);
    mkdirSync(DATA, { recursive: true });
    appendFileSync(join(DATA, 'usage.jsonl'), JSON.stringify({ t: new Date().toISOString(), agent, model: modelNow(), ...ctx.usage, cost_usd: +cost.toFixed(4) }) + '\n');
    send('done', { usage: ctx.usage, cost_usd: +cost.toFixed(4), left: Math.max(0, limit - Q.users[me]), limit });
  } catch (e) {
    conv.messages.length = before;                                            // drop the failed exchange; history stays valid
    Q.spent += costOf(ctx.usage);
    if (!ctx.usage.out) Q.users[me] = Math.max(0, (Q.users[me] || 1) - 1);  // nothing was answered: the question is not counted
    saveQuota();
    const status = e instanceof Anthropic.APIError ? e.status : null;
    send('error', { message: status === 401 ? 'The API key was rejected.' : status === 402 ? 'The AI key is out of credit (its OpenRouter limit is reached).'
      : status === 429 ? 'Rate limited, try again in a minute.'
      : status === 529 || (status && status >= 500) ? 'Claude is busy, try again shortly.' : e.message, status });
  }
  res.end();
}
