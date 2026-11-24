// The Record and the Seal over HTTP, plus how many questions each agent has answered (the numbers for the museum plaques).
//   GET  /api/record?limit=          report cards per agent, the calls and verdicts with their grades, answers per agent, seal head
//   POST /api/record/calls           { calls: [{ token, symbol, at, post, priceUsd, priceSrc }] }  internal: our Discord bot only
//   GET  /api/seal                   head, counts per day, anchors, both public keys, how to verify
//   GET  /api/seal/receipts?day=&limit=&kind=   receipts of a day, newest first
//   GET  /api/seal/r/<hash>          one receipt and its checks
//   POST /api/seal/verify            { receipt } → hash, ECDSA, ML-DSA and link checks
//   GET  /api/watchfire              coins watched now and the latest alerts (whale sales, gathering, fast selling, weight)
//   GET  /api/watchfire/alerts?since=   alerts after a time (KOKEKO posts them in Discord)
//   GET  /api/watchfire/<token>      one coin's Watchfire level (starts watching it for 30 minutes)
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as seal from './gate/seal.mjs';
import * as record from './gate/record.mjs';
import * as watchfire from './gate/watchfire.mjs';

let DATA = null, stats = null, cache = { at: 0, key: '', v: null };
const day = () => new Date().toISOString().slice(0, 10);

export function site(siteRoot) { watchfire.setSite(siteRoot); }
export function start(dataDir) {
  DATA = dataDir;
  seal.setDir(dataDir); record.start(dataDir); seal.startAnchor();
  watchfire.start({ dataDir, siteRoot: process.env.SITE_ROOT || null, calls: record.callsSince });
  try { stats = JSON.parse(readFileSync(join(DATA, 'stats.json'), 'utf8')); } catch { stats = { total: {}, days: {} }; }
}

/** one answered question (web console or Discord /ask), counted per agent */
export function answered(agent) {
  if (!DATA || !agent) return;
  const d = day();
  stats.total[agent] = (stats.total[agent] || 0) + 1;
  const t = (stats.days[d] ||= {}); t[agent] = (t[agent] || 0) + 1;
  for (const k of Object.keys(stats.days).sort().slice(0, -60)) delete stats.days[k];          // keep 60 days
  try { mkdirSync(DATA, { recursive: true }); writeFileSync(join(DATA, 'stats.json.tmp'), JSON.stringify(stats)); renameSync(join(DATA, 'stats.json.tmp'), join(DATA, 'stats.json')); } catch {}
}
function answers() {
  const today = stats?.days?.[day()] || {}, out = {};
  for (const a of new Set([...Object.keys(stats?.total || {}), ...Object.keys(today)])) out[a] = { today: today[a] || 0, total: stats.total[a] || 0 };
  return out;
}

const HASH = /^0x[0-9a-fA-F]{64}$/;
export async function route(p, method, q, body, internal) {
  if (!DATA) return { status: 503, body: { error: 'record offline' } };
  if (p === '/api/record' && method === 'GET') {
    const limit = q.get('limit') || '100';
    if (cache.v && cache.key === limit && Date.now() - cache.at < 20_000) return { body: cache.v };
    const s = seal.sealView();
    const v = { ...record.recordView({ limit }), alerts: watchfire.alerts(0, 50), answers: answers(), seal: { seq: s.seq, head: s.head, today: s.today, signer: s.keys.ecdsa, anchor: s.anchor, lastAnchor: s.lastAnchor } };
    cache = { at: Date.now(), key: limit, v };
    return { body: v };
  }
  if (p === '/api/record/calls' && method === 'POST') {
    if (!internal) return { status: 403, body: { error: 'forbidden' } };
    const list = Array.isArray(body?.calls) ? body.calls.slice(0, 50) : [];
    for (const c of list) await record.noteCall(c).catch(() => null);           // known tokens are skipped, so a re-sync is harmless
    cache.v = null;
    return { body: { ok: true, seen: list.length } };
  }
  if (p === '/api/watchfire' && method === 'GET') return { body: { name: 'MEKANEKO Watchfire', rules: watchfire.RULES, watching: watchfire.watching(), alerts: watchfire.alerts(0, 30) } };
  if (p === '/api/watchfire/alerts' && method === 'GET') return { body: { alerts: watchfire.alerts(Number(q.get('since')) || 0, 20) } };
  if (p.startsWith('/api/watchfire/') && method === 'GET') {
    const t = p.slice('/api/watchfire/'.length);
    if (!/^0x[0-9a-fA-F]{40}$/.test(t)) return { status: 400, body: { error: 'That is not a token address.' } };
    const s = await watchfire.look(t, 20_000);
    return s ? { body: s } : { status: 429, body: { error: 'Watchfire is busy watching other coins. Try again in a few minutes.' } };
  }
  if (p === '/api/seal' && method === 'GET') return { body: seal.sealView() };
  if (p === '/api/seal/receipts' && method === 'GET') return { body: seal.receiptsOf(q.get('day'), q.get('limit'), q.get('kind')) };
  if (p.startsWith('/api/seal/r/') && method === 'GET') {
    const h = p.slice('/api/seal/r/'.length);
    if (!HASH.test(h)) return { status: 400, body: { error: 'That is not a receipt hash.' } };
    const rec = seal.findReceipt(h);
    return rec ? { body: { receipt: rec, check: seal.verifyReceipt(rec) } } : { status: 404, body: { error: 'No receipt with that hash in the last 30 days.' } };
  }
  if (p === '/api/seal/verify' && method === 'POST') return { body: { check: seal.verifyReceipt(body?.receipt || body) } };
  return { status: 404, body: { error: 'not found' } };
}
