// MEKANEKO Watchfire: keeps watching coins after launch and raises an alert when big wallets move.
// Ported from Troya Agent's server/watchfire.mjs (MIT, https://github.com/troyaagent/troya-agent, commit cf797cb; the license
// is in LICENSE-troya-agent.txt in this folder). Changes: watches the coins KOKEKO's Sentry posted (24 hours from the post),
// $MEKANEKO once its contract is in the site config, and coins SHURU is asked about (30 minutes); the launch block comes from
// the coin's first mint instead of Troya's Ring Radar; HTTP polling only; no Arena, Aegis, Treasury or War Table; every alert
// gets a Seal receipt and KOKEKO posts it in Discord.
//
// Signals, read live from the coin's Transfer logs (the same rules Troya tested on the $SUPLEX dump, 20 Nov 2026):
//   · whale     one sale of at least 5% of the supply                                                   → fire
//   · gather    at least 5 different wallets send the coin to one wallet (not a pool, curve or router) within 5 s → fire
//   · velocity  holders sold at least 8% of what they hold in 60 s, with at least 4 sellers and twice as many
//               sellers as buyers in 2 minutes                                                           → red
//   · weight    one holder with at least 10% of the supply, or at least 40% of what holders hold bought through one
//               router (only on coins read from their launch)                                           → amber
// Patterns, not proof: nothing here sells or buys, and nothing here is financial advice.
import { getAddress, isAddress } from "ethers";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { rpc, ADDR, CHAINS, ponsState, iface } from "./robinhood.mjs";
import { dsTokenPairs } from "./market.mjs";
import { seal } from "./seal.mjs";

const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000", DEAD = "0x000000000000000000000000000000000000dead";
const BLOCK_S = 0.1;                                   // Robinhood Chain: ~0.1 s blocks
export const RULES = { gatherSenders: 5, gatherSecs: 5, whalePct: 5, velocityPct: 8, velocitySellers: 4, topPct: 10, herdPct: 40 };
const HISTORY_BLOCKS = 6 * 3600 / BLOCK_S;             // a coin's past is read up to 6 hours back
const ASK_MS = 30 * 60_000, FIRE_MS = 10 * 60_000, RED_MS = 3 * 60_000, SENTRY_MS = 24 * 3600e3;
const RED_ALERT_MS = 30 * 60_000, AMBER_ALERT_MS = 24 * 3600e3, MAX_WATCH = 40;
const lc = (s) => String(s || "").toLowerCase();
const hex = (n) => "0x" + n.toString(16);
const num = (h) => Number(BigInt(h));
const topicAddr = (t) => "0x" + String(t).slice(26).toLowerCase();
let DIR = null, SITE = null, started = false, sources = { calls: () => [] };
const W = new Map();                                    // token → state
let alertsMem = null;                                   // newest first

/* ---------- one coin's state ---------- */
function blank(token) {
  return { token, symbol: null, decimals: 18, supply: 0, venues: new Set([lc(ADDR.poolManager)]), routers: new Set(), bal: new Map(), via: new Map(),
    events: [], p2p: [], seen: new Set(), lastBlock: 0, headBlock: 0, loading: null, ready: false, until: 0, reasons: new Set(), level: "clear", why: [],
    fireAt: 0, fireKind: null, redAt: 0, lastFire: null, launchBlock: 0, fullHistory: false, dev: null, alerted: {}, metrics: null, top: [] };
}
const amountOf = (st, h) => Number(BigInt(h) / 10n ** BigInt(Math.max(0, st.decimals - 6))) / 1e6;
const call = (to, data) => rpc("robinhood", "eth_call", [{ to, data }, "latest"], { timeoutMs: 12_000 });
// long ranges (a coin's first reading: up to 6 hours = 216,000 blocks) in 9,000-block pieces, three at a time
async function getLogs(tokens, from, to) {
  const q = { address: tokens, topics: [T_TRANSFER] };
  const one = async (a, b) => {
    try { return (await rpc("robinhood", "eth_getLogs", [{ ...q, fromBlock: hex(a), toBlock: hex(b) }], { timeoutMs: 20_000 })) || []; }
    catch { return (await rpc("robinhood", "eth_getLogs", [{ ...q, fromBlock: hex(a), toBlock: hex(b) }], { timeoutMs: 25_000, only: CHAINS.robinhood.wide })) || []; }
  };
  if (to - from <= 9_000) return one(from, to);
  const parts = []; for (let a = from; a <= to; a += 9_000) parts.push([a, Math.min(to, a + 8_999)]);
  const out = new Array(parts.length); let i = 0;
  await Promise.all(Array.from({ length: 3 }, async () => { while (i < parts.length) { const k = i++; out[k] = await one(...parts[k]); } }));
  return out.flat();
}
async function load(st) {
  const t = st.token, E = iface.erc20;
  const [sup, dec, sym] = await Promise.all([call(t, E.encodeFunctionData("totalSupply")), call(t, E.encodeFunctionData("decimals")).catch(() => null), call(t, E.encodeFunctionData("symbol")).catch(() => null)]);
  st.decimals = dec && dec !== "0x" ? Number(E.decodeFunctionResult("decimals", dec)[0]) : 18;
  st.supply = amountOf(st, sup);
  try { st.symbol = sym ? String(E.decodeFunctionResult("symbol", sym)[0]).slice(0, 24) : null; } catch { st.symbol = null; }
  // venues: the Pons curve (if any), Uniswap v4's pool manager, and the coin's v3/v2 pairs on DexScreener
  const ps = await ponsState(t).catch(() => null);
  if (ps?.curve) st.venues.add(lc(ps.curve));
  if (ps?.deployer) st.dev = lc(ps.deployer);
  for (const p of await dsTokenPairs(t).catch(() => [])) if (isAddress(String(p.pairAddress || ""))) st.venues.add(lc(p.pairAddress));
  const head = Number(BigInt(await rpc("robinhood", "eth_blockNumber", [])));
  const from = Math.max(0, head - HISTORY_BLOCKS);
  const logs = await getLogs([getAddress(t)], from, head);
  // read from its launch when the first mint (nearly the whole supply, from the zero address) is inside the window
  const mint = logs.find((l) => topicAddr(l.topics[1]) === ZERO && st.supply > 0 && amountOf(st, l.data) >= 0.5 * st.supply);
  st.launchBlock = mint ? num(mint.blockNumber) : 0;
  st.fullHistory = !!mint;
  ingest(st, logs, { history: true });
  st.lastBlock = head; st.headBlock = head; st.ready = true;
  evaluate(st, head);
}

/* ---------- reading transfers: buys, sells, wallet-to-wallet moves ---------- */
function ingest(st, logs, { history = false } = {}) {
  const byTx = new Map();
  for (const l of logs) {
    const k = `${l.transactionHash}:${l.logIndex}`;
    if (st.seen.has(k)) continue;
    st.seen.add(k);
    if (st.seen.size > 20_000) st.seen = new Set([...st.seen].slice(-10_000));
    const g = byTx.get(l.transactionHash) || []; g.push(l); byTx.set(l.transactionHash, g);
  }
  const V = st.venues;
  for (const [tx, g] of byTx) {
    const block = num(g[0].blockNumber);
    const moves = g.map((l) => ({ from: topicAddr(l.topics[1]), to: topicAddr(l.topics[2]), a: amountOf(st, l.data) }));
    // a router sits in the middle of a trade: wallet → R → venue (a sale) or venue → R → wallet (a buy), in one tx
    for (const m of moves) {
      if (V.has(m.to) && !V.has(m.from) && moves.some((x) => x.to === m.from && !V.has(x.from) && x.from !== ZERO)) st.routers.add(m.from);
      if (V.has(m.from) && !V.has(m.to) && moves.some((x) => x.from === m.to && !V.has(x.to) && x.to !== ZERO)) st.routers.add(m.to);
    }
    for (const m of moves) {
      const seed = st.supply > 0 && m.a >= 0.9 * st.supply;                     // seeding the curve or pool at launch: not a trade
      if (m.from !== ZERO) st.bal.set(m.from, (st.bal.get(m.from) || 0) - m.a);
      st.bal.set(m.to, (st.bal.get(m.to) || 0) + m.a);
      const R = st.routers;
      if (seed) continue;
      if (V.has(m.to) && !V.has(m.from)) {
        const via = moves.find((x) => x.to === m.from && !V.has(x.from) && x.from !== ZERO);
        st.events.push({ block, tx, kind: "sell", wallet: via ? via.from : m.from, a: m.a, router: via ? m.from : null });
      } else if (V.has(m.from) && !V.has(m.to) && m.to !== ZERO) {
        const fwd = moves.find((x) => x.from === m.to && !V.has(x.to) && x.to !== ZERO);
        const wallet = fwd ? fwd.to : m.to;
        st.events.push({ block, tx, kind: "buy", wallet, a: m.a, router: fwd ? m.to : null });
        if (!st.via.has(wallet)) st.via.set(wallet, fwd ? m.to : "direct");
      } else if (m.from !== ZERO && m.to !== ZERO && m.to !== DEAD && !R.has(m.from) && !R.has(m.to) && !V.has(m.from) && !V.has(m.to)) {
        st.p2p.push({ block, tx, from: m.from, to: m.to, a: m.a });
      }
    }
    if (!history) evaluate(st, block);
  }
  const keep = (st.lastBlock || 0) - 600 / BLOCK_S;                              // keep the last ~10 minutes of signals
  if (st.events.length > 5_000) st.events = st.events.filter((e) => e.block >= keep);
  if (st.p2p.length > 2_000) st.p2p = st.p2p.filter((e) => e.block >= keep);
}

/* ---------- the verdict ---------- */
function holders(st) {
  const skip = (w) => st.venues.has(w) || st.routers.has(w) || w === ZERO || w === DEAD || w === st.token;
  return [...st.bal.entries()].filter(([w, v]) => v > 1e-6 && !skip(w)).sort((a, b) => b[1] - a[1]);
}
const pctOf = (a, s) => (s > 0 ? ((100 * a) / s).toFixed(1) : "?");
function evaluate(st, B) {
  const since = (secs) => B - secs / BLOCK_S;
  const hs = holders(st);
  const held = hs.reduce((s, [, v]) => s + v, 0);
  const why = [];
  let level = "clear", kind = null, detail = null, tx = null, wallet = null;
  // gather: many wallets to one wallet within a few seconds
  const g = new Map();
  for (const e of st.p2p) if (e.block > since(RULES.gatherSecs) && e.block <= B) { const r = g.get(e.to) || { senders: new Set(), a: 0, tx: e.tx }; r.senders.add(e.from); r.a += e.a; g.set(e.to, r); }
  const gather = [...g.entries()].sort((a, b) => b[1].senders.size - a[1].senders.size)[0];
  if (gather && gather[1].senders.size >= RULES.gatherSenders) {
    level = "fire"; kind = "gather"; tx = gather[1].tx; wallet = gather[0];
    detail = `${gather[1].senders.size} wallets sent ${pctOf(gather[1].a, st.supply)}% of the supply to one wallet within ${RULES.gatherSecs} seconds`;
  }
  // whale: one sale of a big slice of the supply
  const bigSell = st.events.filter((e) => e.kind === "sell" && e.block > since(10) && e.block <= B && st.supply > 0 && (100 * e.a) / st.supply >= RULES.whalePct).sort((a, b) => b.a - a.a)[0];
  if (!kind && bigSell) { level = "fire"; kind = "whale"; tx = bigSell.tx; wallet = bigSell.wallet; detail = `one wallet sold ${pctOf(bigSell.a, st.supply)}% of the supply in one trade`; }
  // velocity: holders leaving fast
  const w60 = st.events.filter((e) => e.block > since(60) && e.block <= B), w120 = st.events.filter((e) => e.block > since(120) && e.block <= B);
  const sold60 = w60.filter((e) => e.kind === "sell").reduce((s, e) => s + e.a, 0);
  const sellers = new Set(w120.filter((e) => e.kind === "sell").map((e) => e.wallet)).size, buyers = new Set(w120.filter((e) => e.kind === "buy").map((e) => e.wallet)).size;
  const soldPct = held > 0 ? (100 * sold60) / (held + sold60) : 0;
  const velocity = soldPct >= RULES.velocityPct && sellers >= RULES.velocitySellers && sellers >= 2 * Math.max(1, buyers);
  const velocityWhy = `holders sold ${soldPct.toFixed(1)}% of what they hold in the last minute (${sellers} sellers, ${buyers} buyers in 2 minutes)`;
  if (velocity) why.push(velocityWhy);
  // weight: only on coins read from their launch (an older coin's balances are just its last 6 hours of trades)
  const top = hs[0], topPct = top && st.supply > 0 ? (100 * top[1]) / st.supply : 0;
  const heavy = st.fullHistory && topPct >= RULES.topPct;
  if (heavy) why.push(`one wallet holds ${topPct.toFixed(1)}% of the supply`);
  const byRouter = new Map(); for (const [w, v] of hs) { const r = st.via.get(w); if (r && r !== "direct") byRouter.set(r, (byRouter.get(r) || 0) + v); }
  const herd = [...byRouter.entries()].sort((a, b) => b[1] - a[1])[0];
  const herdPct = herd && held > 0 ? (100 * herd[1]) / held : 0;
  const herded = st.fullHistory && herdPct >= RULES.herdPct;
  if (herded) why.push(`${herdPct.toFixed(0)}% of what holders hold was bought through one trading router`);
  // sticky levels: a fire stays 10 minutes, red 3 minutes
  const now = Date.now();
  if (kind) {
    const fresh = !st.fireAt || now - st.fireAt > FIRE_MS || st.fireKind !== kind;
    st.fireAt = now; st.fireKind = kind; st.lastFire = { kind, detail, tx, block: B, at: now };
    if (fresh && st.ready) alert(st, kind, detail, { tx, wallet: wallet && isAddress(wallet) ? getAddress(wallet) : null });
  }
  if (velocity) {
    if (st.ready && (!st.alerted.velocity || now - st.alerted.velocity > RED_ALERT_MS)) { st.alerted.velocity = now; alert(st, "velocity", velocityWhy, {}); }
    st.redAt = now;
  }
  if (level !== "fire" && st.fireAt && now - st.fireAt < FIRE_MS) level = "fire";
  else if (level !== "fire" && (velocity || (st.redAt && now - st.redAt < RED_MS))) level = "red";
  else if (level === "clear" && (heavy || herded)) {
    level = "amber";
    if (st.ready && (!st.alerted.weight || now - st.alerted.weight > AMBER_ALERT_MS)) { st.alerted.weight = now; alert(st, "weight", why.filter((w) => !w.startsWith("holders sold")).join("; "), { wallet: heavy && top ? getAddress(top[0]) : null }); }
  }
  st.level = level;
  st.why = [...(st.lastFire && level === "fire" ? [st.lastFire.detail] : []), ...why];
  st.metrics = { holders: hs.length, topPct: +topPct.toFixed(2), herdPct: +herdPct.toFixed(1), soldLastMinPct: +soldPct.toFixed(2), sellers2m: sellers, buyers2m: buyers, block: B };
  st.top = hs.slice(0, 5).map(([w, v]) => ({ wallet: getAddress(w), pct: st.supply ? +((100 * v) / st.supply).toFixed(2) : null, dev: w === st.dev }));
}

/* ---------- alerts: kept, sealed, and read by KOKEKO ---------- */
function alertsList() {
  if (alertsMem) return alertsMem;
  try { alertsMem = JSON.parse(readFileSync(join(DIR, "watchfire.json"), "utf8")).alerts || []; } catch { alertsMem = []; }
  return alertsMem;
}
function saveAlerts() {
  if (!DIR) return;
  try { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, "watchfire.json.tmp"), JSON.stringify({ alerts: alertsMem.slice(0, 300) })); renameSync(join(DIR, "watchfire.json.tmp"), join(DIR, "watchfire.json")); } catch {}
}
function alert(st, kind, detail, { tx = null, wallet = null } = {}) {
  if (!st.reasons.has("sentry") && !st.reasons.has("mekaneko")) return;      // coins only asked about: read for SHURU, not announced
  const a = { token: getAddress(st.token), symbol: st.symbol, kind, level: kind === "velocity" ? "red" : kind === "weight" ? "amber" : "fire", detail, tx, wallet,
    reasons: [...st.reasons], at: Date.now(), receipt: null };
  alertsList().unshift(a); alertsMem.length = Math.min(alertsMem.length, 300);
  saveAlerts();
  console.log(`[watchfire] ${a.level} $${st.symbol || "?"} ${kind}: ${detail}`);
  seal("watchfire", a.token, { ...a, receipt: undefined }, `kokeko`).then((r) => { if (r) { a.receipt = r.hash; saveAlerts(); } }).catch(() => {});
}
export const alerts = (since = 0, n = 30) => alertsList().filter((a) => a.at > since).slice(0, n);

/* ---------- which coins are watched ---------- */
let asks = [];                                          // when the last asks started loading (a cap on what the public can make us read)
export function watch(token, reason = "ask") {
  const t = lc(token);
  if (!isAddress(t)) return null;
  let st = W.get(t);
  if (!st) {
    if (reason === "ask") {
      asks = asks.filter((x) => Date.now() - x < 10 * 60_000);
      if (W.size >= MAX_WATCH || asks.length >= 20) return null;
      asks.push(Date.now());
    }
    st = blank(t); W.set(t, st);
  }
  st.reasons.add(reason);
  if (reason === "ask") st.until = Math.max(st.until, Date.now() + ASK_MS);
  if (!st.ready && !st.loading) st.loading = load(st).catch((e) => { console.warn("[watchfire] load", t, e.message); W.delete(t); }).finally(() => { st.loading = null; });
  return st;
}
/** Watch a coin and wait (up to ms) for its first reading; null when it cannot be read. */
export async function look(token, ms = 15_000) {
  const st = watch(token, "ask");
  if (!st) return null;
  if (st.loading) await Promise.race([st.loading, new Promise((r) => setTimeout(r, ms))]);
  return stateOf(token);
}
export function stateOf(token) {
  const st = W.get(lc(token));
  if (!st) return null;
  if (!st.ready) return { token: getAddress(st.token), level: "loading", why: ["Reading this coin's transfers. Ask again in a few seconds."] };
  return { token: getAddress(st.token), symbol: st.symbol, level: st.level, why: st.why, metrics: st.metrics, top: st.top, lastFire: st.lastFire,
    watching: [...st.reasons], fullHistory: st.fullHistory, rules: RULES,
    note: "Watchfire reads patterns, not proof. Levels: clear, amber (weight in few hands), red (holders selling fast), fire (a whale sale or wallets gathering coins)."
      + (st.fullHistory ? "" : " This coin is older than 6 hours, so only its last 6 hours of transfers were read and how concentrated the holders are is not judged.") };
}
export const watching = () => [...W.values()].filter((s) => s.ready).map((s) => ({ token: getAddress(s.token), symbol: s.symbol, level: s.level, why: s.why.slice(0, 2), reasons: [...s.reasons] }));

function sync() {
  const keep = new Map();
  for (const c of sources.calls(SENTRY_MS)) keep.set(lc(c.token), "sentry");
  let ca = null; try { ca = JSON.parse(readFileSync(join(SITE || "", "mekaneko", "config.json"), "utf8")).ca; } catch {}
  if (isAddress(String(ca || ""))) keep.set(lc(ca), "mekaneko");
  for (const [t, r] of keep) if (W.size < MAX_WATCH || W.has(t)) watch(t, r);
  for (const [t, st] of W) {
    for (const r of ["sentry", "mekaneko"]) if (st.reasons.has(r) && keep.get(t) !== r) st.reasons.delete(r);
    if (st.reasons.has("ask") && Date.now() > st.until) st.reasons.delete("ask");
    if (!st.reasons.size && !st.loading) W.delete(t);
  }
}

/* ---------- live feed: an HTTP poll of the watched coins' transfers ---------- */
let polling = false;
async function poll() {
  if (polling) return;
  const ready = [...W.values()].filter((s) => s.ready);
  if (!ready.length) return;
  polling = true;
  try {
    const head = Number(BigInt(await rpc("robinhood", "eth_blockNumber", [], { timeoutMs: 5_000 })));
    const from = Math.min(...ready.map((s) => s.lastBlock + 1));
    if (head < from) return;
    const logs = await getLogs(ready.map((s) => getAddress(s.token)), Math.max(from, head - 30_000), head);
    const by = new Map(); for (const l of logs) { const t = lc(l.address); if (!by.has(t)) by.set(t, []); by.get(t).push(l); }
    for (const st of ready) { ingest(st, by.get(st.token) || []); st.lastBlock = head; st.headBlock = head; evaluate(st, head); }
  } catch { /* next round */ }
  finally { polling = false; }
}

export function start({ dataDir, siteRoot = null, calls = null }) {
  DIR = dataDir; SITE = siteRoot || SITE || join(dataDir, "..", "site"); if (calls) sources.calls = calls;
  if (started || process.env.WATCHFIRE === "off") return;
  started = true;
  const t = [setInterval(() => poll().catch(() => {}), 3_000), setInterval(() => { try { sync(); } catch {} }, 30_000),
    setInterval(() => { for (const st of W.values()) if (st.ready) evaluate(st, Math.max(st.headBlock, st.lastBlock)); }, 15_000),   // sticky levels decay when a coin goes quiet
    setTimeout(() => { try { sync(); } catch {} }, 5_000)];
  t.forEach((x) => x.unref?.());
}
export function setSite(siteRoot) { if (siteRoot) SITE = siteRoot; }
/** tests: feed transfer logs to a watched coin as if they had just arrived */
export function _feed(token, logs) { const st = W.get(lc(token)); if (!st?.ready) return null; ingest(st, logs); return stateOf(token); }
