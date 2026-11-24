// MEKANEKO Record: every public call an agent makes is graded in public, a report card per agent.
// Ported from Troya Agent's server/record.mjs (MIT, https://github.com/troyaagent/troya-agent, commit cf797cb; the license is
// in LICENSE-troya-agent.txt in this folder). Changes: kept per agent; SHURU's Gate verdicts are graded too; a file store.
//
//   KOKEKO · Sentry calls. When Sentry posts a coin, its price is recorded at once (the Pons curve price read on chain while the
//     coin is on the curve, the pool price after), sampled every 5 minutes for a day, and graded at 1 and 24 hours: a win when
//     the price 24 hours later is above the price at the call. Calls noted late are back-filled from GeckoTerminal candles.
//   SHURU (and TORAMARU) · Gate verdicts. The first verdict an agent gives on a token each UTC day is recorded with the price
//     then and followed for 24 hours. A SAFE verdict "held" when, 24 hours later, the coin did not lose 80% or more at any point
//     and a fresh Gate check still passes its buy-and-sell test; otherwise it "failed". A CAUTION or DANGER verdict is shown
//     with what happened ("collapsed" when it lost 80% or more), not scored as right or wrong.
// Every call, verdict and grade is sealed (seal.mjs). Nothing here is a forecast or advice: it is what the price did afterwards.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ponsState, ponsPublic, gateCheck, tokenMeta } from "./robinhood.mjs";
import { getEthUsd, getRobinhoodToken } from "./market.mjs";
import { seal } from "./seal.mjs";

const FILE = "record.json";
const H = 3600e3, DAY = 24 * H, TICK = 5 * 60e3;
const LIVE_LAG = 3 * 60e3;           // noted more than 3 min after the call (and no price sent with it) → the price comes from candles
const KEEP = 2000, COLLAPSE = 0.2;   // a fall to 20% of the price at the call (-80%) counts as a collapse
const GT = "https://api.geckoterminal.com/api/v2/networks/robinhood";
let DIR = null, mem = null, busy = false, filling = false, timers = [];

const lc = (s) => String(s || "").toLowerCase();
const num = (x) => (Number.isFinite(x) && x > 0 ? x : null);
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const ADDR = /^0x[0-9a-fA-F]{40}$/;

function state() {
  if (mem) return mem;
  try { mem = JSON.parse(readFileSync(join(DIR, FILE), "utf8")); } catch { mem = { entries: {} }; }
  mem.entries ||= {};
  return mem;
}
function save() {
  if (!mem || !DIR) return;
  const all = Object.entries(mem.entries).sort((a, b) => b[1].at - a[1].at);
  if (all.length > KEEP) mem.entries = Object.fromEntries(all.slice(0, KEEP));
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, FILE + ".tmp"), JSON.stringify(mem)); renameSync(join(DIR, FILE + ".tmp"), join(DIR, FILE));
}

/* ---------- price now ---------- */
async function priceNow(token) {
  const ps = await ponsState(token).catch(() => null);
  if (ps && !ps.graduated) {
    const p = ponsPublic(ps);
    if (p.priceInPair > 0 && (p.pair.address === "native" || /^W?ETH$/i.test(p.pair.symbol || ""))) {
      const eu = Number(await getEthUsd().catch(() => 0)) || 0;
      if (eu) return { usd: p.priceInPair * eu, src: "pons-curve" };
    }
  }
  const r = await getRobinhoodToken(token).catch(() => null);
  const usd = num(Number(r?.token?.priceUsd));
  return usd ? { usd, src: "pool", symbol: r.token.symbol || null } : null;
}

/* ---------- back-fill from GeckoTerminal candles ---------- */
async function gt(path) {
  const r = await fetch(GT + path, { headers: { accept: "application/json", "user-agent": "MEKANEKO-record/1.0" }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`);
  return r.json();
}
async function candlesOf(token, iv) {
  const pools = await gt(`/tokens/${token}/pools?page=1`);
  const pool = pools.data?.[0]?.attributes?.address;
  if (!pool) return [];
  const [tf, agg] = iv === "5m" ? ["minute", 5] : iv === "15m" ? ["minute", 15] : ["hour", 1];
  const j = await gt(`/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=1000&currency=usd&token=${token}`);
  return (j.data?.attributes?.ohlcv_list || []).map(([time, open, high, low, close]) => ({ time, open, high, low, close })).sort((a, b) => a.time - b.time);
}
const STEP = { "5m": 300, "15m": 900, "1h": 3600 };
async function fromCandles(c) {
  const age = Date.now() - c.at;
  const iv = age < 24 * H ? "5m" : age < 72 * H ? "15m" : "1h";
  const candles = await candlesOf(c.token, iv);
  if (!candles.length) return false;
  const step = STEP[iv], t0 = Math.floor(c.at / 1000);
  const at = (t) => candles.find((k) => k.time <= t && t < k.time + step);
  const k0 = at(t0);
  if (!k0) return false;
  // the candle the call fell in: its open if the call came early in it, its close if late
  c.p0 = num(t0 - k0.time < step / 2 ? k0.open : k0.close);
  if (!c.p0) return false;
  const win = candles.filter((k) => k.time + step > t0 && k.time <= t0 + 86400);
  c.peak = Math.max(c.p0, ...win.map((k) => k.high).filter(num));
  c.low = Math.min(c.p0, ...win.map((k) => k.low).filter(num));
  const k1 = at(t0 + 3600), k24 = at(t0 + 86400);
  if (k1 && age >= H) c.p1h = num(k1.close);
  if (k24 && age >= DAY) c.p24h = num(k24.close);
  c.src = "candles"; c.via = `candles-${iv}`; c.last = Date.now();
  if (c.p24h) await grade(c);
  else if (age >= DAY + 2 * H) c.status = "no-data";
  return true;
}

/* ---------- sampling and grading ---------- */
async function grade(c) {
  c.status = "graded";
  const collapsed = !!(num(c.p0) && Number.isFinite(c.low) && c.low <= c.p0 * COLLAPSE);
  if (c.kind === "call") c.result = c.p24h > c.p0 ? "win" : "miss";
  else if (c.verdict === "SAFE") {
    // a fresh Gate check a day later: does the buy-and-sell test still pass?
    const g = await gateCheck({ tokenIn: "ETH", tokenOut: c.token, amountIn: "0.01" }).catch(() => null);
    c.recheck = !g?.checks ? "unknown" : g.checks.some((x) => x.status === "fail") ? "fail" : g.checks.some((x) => x.status === "warn") ? "warn" : "pass";
    c.result = collapsed || c.recheck === "fail" ? "failed" : "held";
  } else c.result = collapsed ? "collapsed" : "standing";
  const v = view(c);
  const rec = await seal("record-grade", c.token, { key: c.key, agent: c.agent, verdict: c.verdict || null, priceAtCall: v.priceAtCall, change1h: v.change1h,
    change24h: v.change24h, peakX: v.peakX, lowPct: v.lowPct, recheck: c.recheck || null, result: c.result }, c.agent);
  if (rec) (c.receipts ||= []).push(rec.hash);
}
async function sample(c) {
  const now = Date.now(), age = now - c.at;
  const p = await priceNow(c.token).catch(() => null);
  c.last = now;
  if (!p) {
    c.misses = (c.misses || 0) + 1;
    // the price vanished after the call (pool pulled, curve emptied): a collapse for a verdict, no grade for a call
    if (age >= DAY) { if (c.p0 && c.kind === "verdict") { c.low = 0; c.p24h = 0; await grade(c); } else c.status = c.p0 ? "no-price" : "no-data"; }
    return;
  }
  if (!c.symbol && p.symbol) c.symbol = p.symbol;
  if (!c.p0) { c.p0 = p.usd; c.src = p.src; }
  c.now = p.usd;
  c.peak = Math.max(c.peak || 0, p.usd); c.low = Math.min(c.low ?? Infinity, p.usd);
  if (!c.p1h && age >= H) c.p1h = p.usd;
  if (!c.p24h && age >= DAY) { c.p24h = p.usd; if (age > DAY + 30 * 60e3) c.late = true; await grade(c); }   // late: the server was down at the 24 h mark
}

/* ---------- what the agents report ---------- */
const symbolOf = async (token) => { const m = await tokenMeta(token).catch(() => null); return m?.symbol && m.symbol !== "?" ? String(m.symbol).slice(0, 24) : null; };
/** KOKEKO's Sentry posted a coin. priceUsd: the price our bot read at the post, used as the price at the call. */
export async function noteCall({ token, symbol = null, at = Date.now(), post = null, priceUsd = null, priceSrc = null, agent = "kokeko", source = "sentry" }) {
  if (!DIR || !ADDR.test(String(token || ""))) return null;
  const d = state(), k = `call:${lc(token)}`;
  if (d.entries[k]) return d.entries[k];
  at = Math.min(Number(at) || Date.now(), Date.now());
  const c = { key: k, kind: "call", agent, token: lc(token), symbol: symbol || null, at, post: /^https:\/\/discord\.com\//.test(post || "") ? post : null, source, status: "watching" };
  if (num(Number(priceUsd))) { c.p0 = Number(priceUsd); c.src = priceSrc || "sentry"; c.peak = c.low = c.p0; c.via = "live"; }
  else c.via = Date.now() - at < LIVE_LAG ? "live" : "pending-candles";
  d.entries[k] = c;
  if (!c.symbol) c.symbol = await symbolOf(c.token);
  if (c.via === "live" && !c.p0) await sample(c).catch(() => {});
  const rec = await seal("sentry-call", c.token, { agent, token: c.token, symbol: c.symbol, at: c.at, priceAtCall: c.p0 || null, src: c.src || null, post: c.post }, agent);
  if (rec) c.receipts = [rec.hash];
  save();
  return c;
}
/** A Gate check by an agent (SHURU, TORAMARU). Every check is sealed; the first verdict per agent, token and UTC day is graded. */
export async function noteVerdict({ agent = "shuru", token, symbol = null, worst, gate = null, source = "web" }) {
  if (!DIR || !ADDR.test(String(token || ""))) return null;
  const verdict = worst === "fail" ? "DANGER" : worst === "warn" ? "CAUTION" : worst === "pass" ? "SAFE" : null;
  const rec = await seal("gate-check", lc(token), { agent, token: lc(token), verdict, worst, source, ...(gate || {}) }, agent);
  if (!verdict) return { receipt: rec?.hash || null, verdict };
  const d = state(), k = `verdict:${agent}:${lc(token)}:${day()}`;
  if (!d.entries[k]) {
    const c = { key: k, kind: "verdict", agent, token: lc(token), symbol: symbol || (await symbolOf(token)), verdict, at: Date.now(), source, status: "watching", via: "live", receipts: rec ? [rec.hash] : [] };
    d.entries[k] = c;
    await sample(c).catch(() => {});
    save();
  } else if (rec) { (d.entries[k].later ||= []).push({ at: Date.now(), verdict, receipt: rec.hash }); d.entries[k].later = d.entries[k].later.slice(-10); save(); }
  return { receipt: rec?.hash || null, verdict, graded: d.entries[k].receipts?.[0] === rec?.hash };
}

/* ---------- loops ---------- */
async function tick() {
  if (busy || !DIR) return;
  busy = true;
  try {
    const d = state(), now = Date.now();
    for (const c of Object.values(d.entries)) {
      if (c.status !== "watching" || c.via === "pending-candles" || (!c.p0 && now - c.at > LIVE_LAG)) continue;
      if (now - (c.last || 0) >= TICK - 5000) await sample(c).catch(() => {});
    }
    save();
  } catch (e) { console.warn("[record]", e.message); }
  finally { busy = false; }
}
async function backfill() {
  if (filling || !DIR) return;
  filling = true;
  try {
    const d = state(), now = Date.now();
    const c = Object.values(d.entries).filter((x) => x.status === "watching" && (x.via === "pending-candles" || (!x.p0 && now - x.at > LIVE_LAG)))
      .sort((a, b) => (a.tries || 0) - (b.tries || 0) || b.at - a.at)[0];
    if (!c) return;
    const ok = await fromCandles(c).catch(() => false);
    if (!ok) { c.tries = (c.tries || 0) + 1; if (c.tries >= 6) c.status = "no-data"; }
    if (ok && c.status === "watching" && now - c.at < DAY) c.via = "candles+live";   // the price at the call is known: keep going live
    save();
  } catch (e) { console.warn("[record] backfill:", e.message); }
  finally { filling = false; }
}
export function start(dir) {
  DIR = dir; mem = null;
  if (process.env.RECORD === "off" || timers.length) return;
  timers = [setInterval(() => tick().catch(() => {}), 60_000), setInterval(() => backfill().catch(() => {}), 20_000), setTimeout(() => tick().catch(() => {}), 15_000)];
  timers.forEach((t) => t.unref?.());
}

/* ---------- the public view ---------- */
const pct = (a, b) => (num(a) && Number.isFinite(b) ? (b / a - 1) * 100 : null);
function view(c) {
  return {
    key: c.key, kind: c.kind, agent: c.agent, token: c.token, symbol: c.symbol, at: c.at, post: c.post || null, source: c.source, verdict: c.verdict || null,
    status: c.status, via: c.via, priceAtCall: c.p0 ?? null, change1h: pct(c.p0, c.p1h), change24h: pct(c.p0, c.p24h),
    changeNow: c.status === "watching" ? pct(c.p0, c.now) : null, peakX: num(c.p0) && num(c.peak) ? c.peak / c.p0 : null, lowPct: pct(c.p0, c.low),
    recheck: c.recheck || null, result: c.status === "graded" ? c.result : null, late: !!c.late, receipts: c.receipts || [], later: (c.later || []).length,
  };
}
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const r24 = (list) => median(list.map((c) => c.change24h).filter((x) => x != null));

export function recordView({ limit = 100 } = {}) {
  const all = Object.values(state().entries).sort((a, b) => b.at - a.at).map(view);
  const n = Math.min(500, Math.max(1, Number(limit) || 100));
  const cards = {};
  const calls = all.filter((c) => c.kind === "call");
  for (const agent of new Set(calls.map((c) => c.agent))) {
    const mine = calls.filter((c) => c.agent === agent), graded = mine.filter((c) => c.result);
    const peaks = mine.filter((c) => c.peakX != null && (c.status === "graded" || Date.now() - c.at >= DAY)).map((c) => c.peakX);
    cards[agent] = { agent, type: "calls", calls: mine.length, watching: mine.filter((c) => c.status === "watching").length, graded: graded.length,
      wins: graded.filter((c) => c.result === "win").length, winRate: graded.length ? graded.filter((c) => c.result === "win").length / graded.length : null,
      median24h: r24(graded), medianPeakX: median(peaks), reached2x: peaks.filter((x) => x >= 2).length, reachedOf: peaks.length,
      best: graded.length ? graded.reduce((a, b) => (b.peakX > a.peakX ? b : a)) : null, worst: graded.length ? graded.reduce((a, b) => (b.change24h < a.change24h ? b : a)) : null };
  }
  const verdicts = all.filter((c) => c.kind === "verdict");
  for (const agent of new Set(verdicts.map((c) => c.agent))) {
    const mine = verdicts.filter((c) => c.agent === agent);
    const by = (v) => { const l = mine.filter((c) => c.verdict === v), g = l.filter((c) => c.result);
      return { given: l.length, graded: g.length, held: g.filter((c) => c.result === "held").length, failed: g.filter((c) => c.result === "failed").length,
        collapsed: g.filter((c) => c.result === "collapsed" || c.result === "failed").length, median24h: r24(g) }; };
    const safe = by("SAFE");
    cards[agent] = { agent, type: "verdicts", verdicts: mine.length, watching: mine.filter((c) => c.status === "watching").length,
      SAFE: safe, CAUTION: by("CAUTION"), DANGER: by("DANGER"), safeHeldRate: safe.graded ? safe.held / safe.graded : null };
  }
  return {
    cards, calls: calls.slice(0, n), verdicts: verdicts.slice(0, n), updatedAt: Date.now(),
    rules: "A call is the moment KOKEKO's Sentry posts a coin. Its price is recorded then (the Pons curve price read on chain while the coin is on the curve, the pool price after), sampled every 5 minutes for a day and graded 24 hours later: a win when the price is above the price at the call. A verdict is the first SAFE, CAUTION or DANGER an agent gives on a token in a UTC day, from the Gate. A SAFE verdict held when, 24 hours later, the coin never lost 80% or more and a fresh Gate check still passes; a CAUTION or DANGER verdict is shown with what happened, not scored. Calls noted late take their price from GeckoTerminal candles and say so. Every call, verdict and grade has a signed receipt in the Seal. Nothing here is a forecast or financial advice.",
  };
}
