// MEKANEKO Sentry: every new Pons launch on Robinhood Chain goes through the Gate. Only the ones worth a look reach the
// launches channel: passed with no warning AND real buying (at least SENTRY_MIN_POST_ETH, default 0.5 ETH, on the curve,
// from SENTRY_MIN_BUYERS, default 25, independent wallets), re-checked at about 5, 15 and 60 minutes so a coin that picks up
// later still makes it. A wallet that bought SENTRY_BOT_COINS (default 8) other new coins in the last 24 hours is a bot or a
// farm and is not counted. A ticker already posted that day (look-alike letters folded) and a name mixing Cyrillic or Greek
// into Latin letters are held. Wording stays factual: check results, never "scam" or "safe".
//
// Ported from Troya Agent, https://github.com/troyaagent/troya-agent (server/sentry.mjs, commit cf797cb), MIT License,
// Copyright (c) 2026 Troya Agent contributors (full text in LICENSE-troya-agent.txt next to this file). Kept: the launch
// scan, the Gate verdict, the buying bar, the buyer and bot-farm counting, copies and look-alikes, the paper-liquidity guard,
// the re-check schedule and the daily counts. Left out: other launchpads and pools, Ring Radar, Oath, autopilot, Arena,
// holder and staker messages, Telegram output. Posting is the caller's: start() takes onPost(result) and onRecap(counts).
import { readFileSync } from "node:fs";
import { ADDR, CHAINS, rpc, gateCheck, ponsState, ponsPublic, ponsProfile, tokenMeta } from "./robinhood.mjs";
import { dsTokenPairs, getEthUsd } from "./market.mjs";

const LAUNCH_TOPIC = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";   // PonsFactory launch event
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NULL_ADDR = "0x0000000000000000000000000000000000000000";
const TEST_ETH = "0.01";
export const MIN_POST = Number(process.env.SENTRY_MIN_POST_ETH ?? 0.5);   // real money on the curve, not a dev test buy
export const MIN_BUYERS = Number(process.env.SENTRY_MIN_BUYERS ?? 25);    // …from at least this many independent wallets
const BOT_COINS = Number(process.env.SENTRY_BOT_COINS ?? 8);              // bought this many other new coins in 24 h: a bot
const TRACTION_S = [5 * 60, 10 * 60, 45 * 60];   // passed but quiet: look again at about 5, 15 and 60 minutes
const MIN_RAISED = 0.002;                         // below this a curve is dust
const FIRST_CHECK_S = 90;                         // past the launch snipe tax
const RETRY_S = [5 * 60, 15 * 60];                // no buys yet: look again, then drop quietly
const MAX_RANGE = 2000, CATCHUP = 3000, MAX_GAP = 20000;

const STOCKS = (() => { try { return new Set(JSON.parse(readFileSync(new URL("./data/robinhood-stocks.json", import.meta.url), "utf8")).stocks.map((x) => x.address.toLowerCase())); } catch { return new Set(); } })();
export const isStock = (a) => STOCKS.has(String(a || "").toLowerCase());

/* ---------- text ---------- */
// names and symbols are attacker-controlled: drop links, handles, control chars, keep it short
export function cleanName(s, n = 32) {
  let t = String(s ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "");
  t = t.replace(/(https?:\/\/|www\.)\S*/gi, "").replace(/\b[\w-]+\.(com|io|xyz|me|org|net|fun|app|gg|co|codes|family|sh|ai)\b\S*/gi, "").replace(/t\.me\/\S*/gi, "").replace(/@\w+/g, "");
  return t.replace(/\s+/g, " ").trim().slice(0, n);
}
export const cleanSymbol = (s) => cleanName(s, 16).replace(/[^\p{L}\p{N}._-]/gu, "").slice(0, 16);
export const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const logoCid = (logo) => {
  const m = /^(?:ipfs:\/\/(?:ipfs\/)?|https:\/\/[^/?#]+\/ipfs\/)([A-Za-z0-9]{46,100})(\/[A-Za-z0-9._-]{1,80})?$/.exec(String(logo || "").trim());
  return m ? m[1] + (m[2] || "") : null;
};

// verdict for a fresh launch: thin depth is expected on a new curve, so it is reported, never the verdict
export function verdict(g) {
  const real = g.checks.filter((c) => c.key !== "depth");
  const fail = real.find((c) => c.status === "fail");
  if (fail) return { v: "failed", why: fail };
  const sell = real.find((c) => c.key === "sell");
  if (sell && sell.status === "skip" && /holds no buyers|too little/i.test(sell.detail)) return { v: "nobuys" };
  const warn = real.find((c) => c.status === "warn");
  if (warn) return { v: "caution", why: warn };
  return { v: "passed" };
}
// real money behind the coin: graduated, or at least MIN_POST ETH raised on an ETH curve
function moneyIn(r, minEth) {
  if (!r.pons) return false;
  if (r.pons.graduated) return true;
  const ethPair = r.pons.pair?.address === "native" || /^W?ETH$/i.test(r.pons.pair?.symbol || "");
  return ethPair && Number(r.pons.raised) >= minEth;
}
// copies and impersonations: Cyrillic or Greek letters mixed into a Latin name, and one ticker per day
const MIXED = /[Ͱ-ϿЀ-ԯ]/;
export const lookAlike = (r) => [r?.symbol, r?.name].some((x) => x && /[A-Za-z]/.test(x) && MIXED.test(x));
const FOLD_FROM = [..."аеорсухіјѕԁһԛԝкмнтвαβεζηικμνορτυχ"], FOLD_TO = [..."aeopcyxijsdhqwkmhtbabezhikmnoptyx"];
export function tickerKey(sym) {
  const t = String(sym || "").normalize("NFKC").toLowerCase().replace(/./gu, (c) => { const i = FOLD_FROM.indexOf(c); return i < 0 ? c : FOLD_TO[i]; });
  return t.replace(/[^\p{L}\p{N}]/gu, "");
}
// the channel's filter. null = post it; otherwise the reason it is held back
export function holdReason(r, { minEth = MIN_POST, minBuyers = MIN_BUYERS, copy = null } = {}) {
  if (r?.v !== "passed") return r?.why ? `${r.why.label}: ${r.why.detail}` : "Did not pass";
  if (lookAlike(r)) return "Name mixes look-alike letters (Cyrillic or Greek with Latin): not posted";
  if (copy) return `Same ticker as ${copy.symbol ? "$" + copy.symbol : "a coin"} (${short(copy.token)}), posted in the last 24 hours: not posted`;
  if (!moneyIn(r, minEth)) return `Passed, but under ${minEth} ETH raised within an hour: not posted`;
  if (!r.buyers) return "Passed, but its buyers could not be counted: not posted";
  if (r.buyers.organic < minBuyers) return `Passed, but only ${r.buyers.organic} independent buyers of ${r.buyers.all} within an hour (${minBuyers} needed): not posted`;
  return null;
}

/* ---------- liquidity next to volume ---------- */
// a pool minted at a made-up price reports millions of "liquidity" on a few dollars of trading: a caution, never a pass
const PAPER_MIN_USD = 250_000, PAPER_RATIO = 1000, PAPER_REAL_SHARE = 0.1;
const usd0 = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${Number(v || 0).toFixed(2)}`);
export function paperLiquidity({ liquidityUsd, volume24hUsd, realLiquidityUsd } = {}) {
  const L = Number(liquidityUsd), V = Math.max(0, Number(volume24hUsd) || 0);
  if (!(L >= PAPER_MIN_USD) || L < Math.max(V, 1) * PAPER_RATIO) return null;
  if (realLiquidityUsd != null && Number(realLiquidityUsd) >= L * PAPER_REAL_SHARE) return null;
  return { label: "Liquidity vs volume", detail: `${usd0(L)} of pool liquidity on ${usd0(V)} traded in 24 hours${realLiquidityUsd != null ? ` (${usd0(Number(realLiquidityUsd))} of it in ETH or USDG)` : ""}: the pool's price may be set, not traded` };
}
export function pairsLiquidity(pairs, token, ethUsd) {
  const a = String(token).toLowerCase();
  const money = { [ADDR.weth.toLowerCase()]: "eth", [NULL_ADDR]: "eth", [ADDR.usdg.toLowerCase()]: "usd" };
  let L = 0, V = 0, real = 0, n = 0;
  for (const p of pairs || []) {
    const b = String(p.baseToken?.address || "").toLowerCase(), q = String(p.quoteToken?.address || "").toLowerCase();
    if (b !== a && q !== a) continue;
    const l = Number(p.liquidity?.usd);
    if (l > 0) { L += l; n++; }
    V += Number(p.volume?.h24) || 0;
    const other = b === a ? q : b, amt = Number(b === a ? p.liquidity?.quote : p.liquidity?.base) || 0;
    if (money[other] === "usd") real += amt;
    else if (money[other] === "eth" && ethUsd) real += amt * ethUsd;
  }
  return n ? { liquidityUsd: L, volume24hUsd: V, realLiquidityUsd: ethUsd ? real : null } : null;
}
async function paperCheck(token) {
  try {
    const [pairs, ethUsd] = await Promise.all([dsTokenPairs(token), getEthUsd().catch(() => null)]);
    const l = pairsLiquidity(pairs, token, ethUsd);
    return l ? paperLiquidity(l) : null;
  } catch { return null; }
}

/* ---------- buyers ---------- */
// who bought: wallets that received the coin from its curve or pool. Whoever it was minted to and the deployer are left out.
export function buyerSet(logs, { venues = [], exclude = [] } = {}) {
  const a = (t) => ("0x" + String(t).slice(26)).toLowerCase();
  const minted = new Set(), fan = new Map();
  for (const l of logs || []) {
    const f = a(l.topics[1]), to = a(l.topics[2]);
    if (f === NULL_ADDR) { minted.add(to); continue; }
    if (!fan.has(f)) fan.set(f, new Set());
    fan.get(f).add(to);
  }
  const top = [...fan.entries()].sort((x, y) => y[1].size - x[1].size)[0]?.[0];
  const src = new Set([top, ...venues].filter(Boolean).map((x) => x.toLowerCase()));
  const skip = new Set([...minted, ...src, ...exclude.filter(Boolean).map((x) => x.toLowerCase()), NULL_ADDR]);
  const out = new Set();
  for (const f of src) for (const to of fan.get(f) || []) if (!skip.has(to)) out.add(to);
  return [...out];
}
// a day of buyer wallets per coin (40-bit ids), so a wallet buying every new coin is recognised as a bot or a farm
const hist = new Map(), wcount = new Map();
let walletsDirty = false;
const wid = (a) => a.slice(2, 12);
function remember(token, ids, t = Date.now()) {
  const old = hist.get(token);
  if (old) for (const w of old.w) { const n = (wcount.get(w) || 1) - 1; n > 0 ? wcount.set(w, n) : wcount.delete(w); }
  const w = new Set(ids.slice(0, 800));
  hist.set(token, { t: old?.t || t, w });
  for (const x of w) wcount.set(x, (wcount.get(x) || 0) + 1);
  walletsDirty = true;
}
function pruneWallets() {
  const cut = Date.now() - 86400e3;
  for (const [k, v] of hist) if (v.t < cut) { remember(k, []); hist.delete(k); }
}
export function organicOf(token, wallets) {
  const mine = hist.get(token.toLowerCase())?.w;
  return wallets.filter((a) => { const id = wid(a); return (wcount.get(id) || 0) - (mine?.has(id) ? 1 : 0) < BOT_COINS; }).length;
}
const hex = (n) => "0x" + n.toString(16);
export async function transfersOf(token, fromBlock, sinceMs = null) {
  const head = Number(BigInt(await rpc("robinhood", "eth_blockNumber", [])));
  const from = Math.max(fromBlock || head - (sinceMs ? Math.ceil((Date.now() - sinceMs) / 1000 + 3600) * 12 : 400000), 0);
  const q = { address: token, topics: [T_TRANSFER], fromBlock: hex(from), toBlock: hex(head) };
  try { return await rpc("robinhood", "eth_getLogs", [q], { timeoutMs: 20000, only: CHAINS.robinhood.wide }); } catch { /* next */ }
  try { return await rpc("robinhood", "eth_getLogs", [q], { timeoutMs: 20000 }); }
  catch (e) {
    if (head - from > 60 * 9000) throw e;
    const out = [];
    for (let b = from; b <= head; b += 9000) out.push(...((await rpc("robinhood", "eth_getLogs", [{ address: token, topics: [T_TRANSFER], fromBlock: hex(b), toBlock: hex(Math.min(head, b + 8999)) }], { timeoutMs: 20000 })) || []));
    return out;
  }
}
async function measureBuyers(r, q) {
  try {
    const all = buyerSet(await transfersOf(r.token, q?.block), { venues: [r.pons?.curve, ADDR.poolManager], exclude: [r.pons?.deployer, r.pons?.creatorFeeRecipient] });
    remember(r.token.toLowerCase(), all.map(wid));
    r.buyers = { all: all.length, organic: organicOf(r.token, all) };
  } catch (e) { r.buyers = null; log("buyers", r.token, e.message); }
}

/* ---------- one launch ---------- */
async function nameOf(token) {
  const m = await tokenMeta(token).catch(() => null);
  return { symbol: m && m.symbol !== "?" ? m.symbol : "", name: m?.name || "" };
}
export async function checkLaunch(token) {
  const g = await gateCheck({ tokenIn: "ETH", tokenOut: token, amountIn: TEST_ETH, slippageBps: 100 });
  const ps = await ponsState(token).catch(() => null);
  const pons = ponsPublic(ps);
  let vd = verdict(g);
  if (vd.v !== "failed" && pons && !pons.graduated && pons.pair?.address === "native" && (pons.raised ?? 0) < MIN_RAISED) vd = { v: "nobuys" };
  let t = g.quote?.tokenOut || {};
  if (!t.symbol) t = await nameOf(token);
  return { token, symbol: cleanSymbol(t.symbol), name: cleanName(t.name), checks: g.checks, pons, snipe: !!(ps && ps.snipeBps > 0n), ...vd, at: Date.now() };
}

/* ---------- the loop ---------- */
let store = null, busy = false, lastWalletSave = 0, onPost = null, onRecap = null, recapHour = 13, log = () => {};
const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const blank = () => ({ seen: 0, passed: 0, caution: 0, failed: 0, nobuys: 0, posted: 0 });
function bump(s, k) { s.events.push([Date.now(), k]); const cut = Date.now() - 3 * 86400e3; while (s.events.length && s.events[0][0] < cut) s.events.shift(); }
export function countSince(events, since) { const d = blank(); for (const [t, k] of events) if (t >= since && k in d) d[k]++; return d; }

async function scanLogs(q) {
  for (let i = 0; i < 2; i++) {
    try { return await rpc("robinhood", "eth_getLogs", [q], { timeoutMs: 20000, only: CHAINS.robinhood.wide }); }
    catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  return rpc("robinhood", "eth_getLogs", [q], { timeoutMs: 20000 });
}
async function scan(s) {
  const head = Number(BigInt(await rpc("robinhood", "eth_blockNumber", [])));
  let from = s.lastBlock ? s.lastBlock + 1 : head - CATCHUP;
  if (head - from > MAX_GAP) from = head - CATCHUP;                     // after downtime: no flood of stale launches
  while (from <= head) {
    const to = Math.min(head, from + MAX_RANGE - 1);
    const logs = await scanLogs({ address: ADDR.ponsFactory, topics: [LAUNCH_TOPIC], fromBlock: hex(from), toBlock: hex(to) });
    for (const l of logs || []) {
      const token = "0x" + l.topics[1].slice(26);
      if (s.seen[token]) continue;
      s.seen[token] = Date.now();
      s.queue.push({ token, due: Date.now() + FIRST_CHECK_S * 1000, tries: 0, seenAt: Date.now(), block: Number(l.blockNumber) });
      bump(s, "seen");
    }
    s.lastBlock = to;
    from = to + 1;
  }
  s.seen = Object.fromEntries(Object.entries(s.seen).sort((a, b) => b[1] - a[1]).slice(0, 3000));
}
const recentlyPosted = (s, token) => (s.posted?.[token.toLowerCase()] || 0) > Date.now() - 86400e3;
function markPosted(s, r) {
  const now = Date.now();
  s.posted ||= {}; s.posted[r.token.toLowerCase()] = now;
  for (const [k, t] of Object.entries(s.posted)) if (t < now - 86400e3) delete s.posted[k];
  s.tickers ||= {};
  const k = tickerKey(r.symbol);
  if (k) s.tickers[k] = { token: r.token.toLowerCase(), symbol: r.symbol, t: now, organic: r.buyers?.organic ?? null };
  for (const [x, v] of Object.entries(s.tickers)) if (v.t < now - 86400e3) delete s.tickers[x];
}
// another coin already posted under the same ticker in the last 24 hours; a later one with more than twice its independent
// buyers is still posted (the first was the copy), with a line naming the other
export function copyOf(s, r) {
  const k = tickerKey(r.symbol), e = k ? s.tickers?.[k] : null;
  if (!e || e.token === r.token.toLowerCase() || e.t <= Date.now() - 86400e3) return null;
  if (r.buyers && e.organic != null && r.buyers.organic > 2 * e.organic) { r.alsoTicker = e; return null; }
  return e;
}
function record(s, r, posted, reason) {
  s.recent ||= [];
  s.recent.unshift({ token: r.token, symbol: r.symbol, name: r.name, verdict: r.v, posted, reason, raised: r.pons?.raised ?? null,
    progressPct: r.pons?.progressPct ?? null, buyers: r.buyers ? r.buyers.organic : null, at: r.at });
  s.recent.length = Math.min(s.recent.length, 200);
}
async function work(s) {
  const now = Date.now();
  for (const q of s.queue.filter((x) => x.due <= now).slice(0, 4)) {
    if (isStock(q.token)) { s.queue = s.queue.filter((x) => x !== q); continue; }
    let r;
    try { r = await checkLaunch(q.token); }
    catch (e) { q.due = now + 60000; q.err = (q.err || 0) + 1; if (q.err >= 3) s.queue = s.queue.filter((x) => x !== q); log(q.token, e.message); continue; }
    if (r.snipe && q.tries < 3) { q.due = now + 60000; q.tries++; continue; }
    if (r.v === "nobuys") {
      if (q.tries < RETRY_S.length) { q.due = now + RETRY_S[q.tries] * 1000; q.tries++; continue; }
      s.queue = s.queue.filter((x) => x !== q); bump(s, "nobuys"); continue;
    }
    r.ageMs = r.at - (q.seenAt || s.seen[q.token] || r.at);
    if (r.v === "passed") { const paper = await paperCheck(r.token); if (paper) { r.v = "caution"; r.why = paper; } }
    await measureBuyers(r, q);                                          // every checked coin feeds the wallet history
    const copy = r.v === "passed" ? copyOf(s, r) : null;
    const why = r.v === "passed" && recentlyPosted(s, r.token) ? "Posted already in the last 24 hours" : holdReason(r, { copy });
    const permanent = lookAlike(r) || !!copy;
    if (why && r.v === "passed" && !permanent && (q.lt || 0) < TRACTION_S.length) { q.due = now + TRACTION_S[q.lt || 0] * 1000; q.lt = (q.lt || 0) + 1; continue; }
    s.queue = s.queue.filter((x) => x !== q);
    let posted = false;
    if (!why) {
      try { r.profile = await ponsProfile(r.token).catch(() => null); await onPost?.(r); posted = true; bump(s, "posted"); markPosted(s, r); }
      catch (e) { log("post failed", r.token, e.message); }
    }
    bump(s, r.v);
    record(s, r, posted, why);
  }
}
async function recap(s) {
  const now = new Date();
  if (now.getUTCHours() !== recapHour || s.recapSent === dayKey()) return;
  s.recapSent = dayKey();
  const d = countSince(s.events, Date.now() - 86400e3);
  if (d.seen) await onRecap?.(d).catch((e) => log("recap failed", e.message));
}
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const s = await store.read({ lastBlock: 0, seen: {}, queue: [], events: [], recapSent: null, recent: [] });
    s.events ||= [];
    await scan(s).catch((e) => log("scan", e.message));
    await work(s);
    pruneWallets();
    if (walletsDirty && Date.now() - lastWalletSave > 60000) { walletsDirty = false; lastWalletSave = Date.now();
      s.wallets = Object.fromEntries([...hist].map(([k, v]) => [k, { t: v.t, w: [...v.w] }])); }
    await recap(s).catch((e) => log("recap", e.message));
    await store.write(s);
  } finally { busy = false; }
}

// start({ store: { read(fallback), write(state) }, onPost(result), onRecap(counts), recapUtcHour, log, everyMs })
export async function start(o) {
  store = o.store; onPost = o.onPost; onRecap = o.onRecap; recapHour = o.recapUtcHour ?? 13; log = o.log || log;
  const s = await store.read({});
  for (const [k, v] of Object.entries(s.wallets || {})) if (v.t > Date.now() - 86400e3) remember(k, v.w, v.t);
  walletsDirty = false;
  const every = o.everyMs ?? 15000;
  setTimeout(() => tick().catch((e) => log("tick", e.message)), 5000).unref?.();
  return setInterval(() => tick().catch((e) => log("tick", e.message)), every);
}
export const recentResults = async (n = 20) => ((await store?.read({}))?.recent || []).slice(0, n);
