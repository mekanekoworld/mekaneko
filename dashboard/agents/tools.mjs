// Custom tools for the MEKANEKO agents (server side). Real data: Robinhood Chain JSON-RPC, GeckoTerminal, DexScreener.
// Each tool: { def (Anthropic tool definition), run(input, ctx) -> JSON-able result }. ctx = { lang, emit(card), dataDir, siteRoot }.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const CHAIN = { id: 4663, name: 'Robinhood Chain', explorer: 'https://robinhoodchain.blockscout.com',
  rpc: (process.env.MEKANEKO_RPC || 'https://robinhood.drpc.org,https://4663.rpc.thirdweb.com').split(',') };
const GT = 'https://api.geckoterminal.com/api/v2/networks/robinhood';
const DS = 'https://api.dexscreener.com/latest/dex';
const ADDR = /^0x[0-9a-fA-F]{40}$/;

// ---------------------------------------------------------------- http + cache
const cache = new Map();
async function getJSON(url, ttl = 60_000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'MEKANEKO-agents/1.0' }, signal: AbortSignal.timeout(12_000) });
  if (r.status === 429 && hit) return hit.v;                       // rate limited: serve the last copy
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  const v = await r.json(); cache.set(url, { t: Date.now(), v }); return v;
}
async function rpc(method, params = []) {
  let last;
  for (const url of CHAIN.rpc) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) { last = e; }
  }
  throw new Error('Robinhood Chain RPC unreachable: ' + (last?.message || ''));
}
const pad = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const big = (hex) => (hex && hex !== '0x' ? BigInt(hex) : 0n);
function decodeString(hex) {
  if (!hex || hex === '0x') return null;
  const h = hex.slice(2);
  if (h.length === 64) return Buffer.from(h, 'hex').toString('utf8').replace(/\0+$/, '') || null;   // bytes32 style
  try { const len = parseInt(h.slice(64, 128), 16); return Buffer.from(h.slice(128, 128 + len * 2), 'hex').toString('utf8'); } catch { return null; }
}
const units = (v, d) => { const s = 10n ** BigInt(d); return Number(v / s) + Number(v % s) / Number(s); };
async function erc20(addr) {
  const [n, s, d, t] = await Promise.all(['0x06fdde03', '0x95d89b41', '0x313ce567', '0x18160ddd'].map((x) => call(addr, x).catch(() => null)));
  const decimals = d ? Number(big(d)) : 18;
  return { name: decodeString(n), symbol: decodeString(s), decimals, totalSupplyRaw: t ? big(t) : null };
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// ---------------------------------------------------------------- market helpers
function poolRow(p, tokens) {
  const a = p.attributes, base = p.relationships?.base_token?.data?.id?.split('_')[1];
  return { pool: a.name, token: base, symbol: tokens?.[base] || a.name.split(' / ')[0], price_usd: +a.base_token_price_usd,
    market_cap_usd: a.market_cap_usd ? Math.round(+a.market_cap_usd) : null, fdv_usd: a.fdv_usd ? Math.round(+a.fdv_usd) : null,
    liquidity_usd: Math.round(+a.reserve_in_usd), volume_24h_usd: Math.round(+a.volume_usd?.h24 || 0),
    change_1h_pct: +a.price_change_percentage?.h1 || 0, change_24h_pct: +a.price_change_percentage?.h24 || 0,
    buys_24h: a.transactions?.h24?.buys, sells_24h: a.transactions?.h24?.sells,
    dex: p.relationships?.dex?.data?.id, created: a.pool_created_at };
}
async function pools(kind, limit) {
  const j = await getJSON(`${GT}/${kind}?page=1`);
  return { source: 'GeckoTerminal (Robinhood Chain)', pools: j.data.slice(0, limit).map((p) => poolRow(p)) };
}
function pairRow(p) {
  return { pair: `${p.baseToken.symbol}/${p.quoteToken.symbol}`, token: p.baseToken.address, name: p.baseToken.name, symbol: p.baseToken.symbol,
    dex: p.dexId, price_usd: +p.priceUsd || null, liquidity_usd: Math.round(p.liquidity?.usd || 0), fdv_usd: p.fdv ? Math.round(p.fdv) : null,
    market_cap_usd: p.marketCap ? Math.round(p.marketCap) : null, volume_24h_usd: Math.round(p.volume?.h24 || 0),
    change_1h_pct: p.priceChange?.h1 ?? null, change_24h_pct: p.priceChange?.h24 ?? null,
    buys_24h: p.txns?.h24?.buys, sells_24h: p.txns?.h24?.sells, created: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
    url: p.url, socials: (p.info?.socials || []).map((s) => s.url || s.type), websites: (p.info?.websites || []).map((w) => w.url) };
}
async function tokenPairs(addresses) {
  const j = await getJSON(`${DS}/tokens/${addresses.join(',')}`, 30_000);
  return (j.pairs || []).filter((p) => p.chainId === 'robinhood').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
}

// ---------------------------------------------------------------- local stores (single user while testing)
function store(ctx, name, fallback) {
  const f = join(ctx.dataDir, name);
  return { get: () => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback),
           set: (v) => { mkdirSync(ctx.dataDir, { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 1)); } };
}
export function demoTokens(siteRoot) {
  try { return JSON.parse(readFileSync(join(siteRoot, 'mekaneko/nekopult-demo.json'), 'utf8')).tokens; } catch { return []; }
}

// ---------------------------------------------------------------- tool definitions
const S = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const address = { type: 'string', description: '0x... address on Robinhood Chain' };

export const TOOLS = {
  chain_status: {
    def: { name: 'chain_status', description: 'Live Robinhood Chain health: chain id, latest block, its age, gas price.', input_schema: S({}) },
    async run() {
      const [id, bn, gp] = await Promise.all([rpc('eth_chainId'), rpc('eth_blockNumber'), rpc('eth_gasPrice')]);
      const blk = await rpc('eth_getBlockByNumber', [bn, false]);
      return { chain_id: Number(id), latest_block: Number(bn), block_age_s: Math.max(0, Math.round(Date.now() / 1000 - Number(blk.timestamp))),
        gas_price_gwei: Number(BigInt(gp)) / 1e9, explorer: CHAIN.explorer, source: 'Robinhood Chain RPC' };
    } },
  service_status: {                                                       // GYUDON: the same checks as the public status page (/status)
    def: { name: 'service_status', description: 'MEKANEKO status right now, the same checks as the public status page: Robinhood Chain RPC health and response time, the market data feed (GeckoTerminal), and the agents. Use it for "is X down?" questions.', input_schema: S({}) },
    async run() {
      const time = async (f) => { const t0 = Date.now(); try { const v = await f(); return { ok: true, ms: Date.now() - t0, v }; } catch (e) { return { ok: false, ms: Date.now() - t0, error: e.message }; } };
      const [chain, mkt] = await Promise.all([time(() => TOOLS.chain_status.run({})), time(() => market.trending(3))]);
      return { agents: 'online (this answer is coming from them)',
        robinhood_chain: chain.ok ? { status: chain.v.block_age_s < 60 ? 'healthy' : 'slow', ...chain.v, rpc_ms: chain.ms } : { status: 'unreachable', error: chain.error },
        market_data: mkt.ok ? { status: 'live', source: 'GeckoTerminal', pools_returned: (mkt.v || []).length, ms: mkt.ms } : { status: 'unreachable', error: mkt.error },
        status_page: 'https://app.mekaneko.com/en/status/', checked_at: new Date().toISOString() };
    } },
  token_onchain: {
    def: { name: 'token_onchain', description: 'On-chain facts about a token or contract on Robinhood Chain: is it a contract, ERC-20 name/symbol/decimals/supply, owner and whether ownership is renounced, share of supply burned.',
      input_schema: S({ address }, ['address']) },
    async run({ address: a }) {
      const code = await rpc('eth_getCode', [a, 'latest']);
      if (!code || code === '0x') return { address: a, is_contract: false, note: 'No contract code at this address (a wallet, or wrong chain).' };
      const t = await erc20(a);
      const owner = await call(a, '0x8da5cb5b').then((h) => (h && h.length >= 66 ? '0x' + h.slice(-40) : null)).catch(() => null);
      const dead = await Promise.all(['000000000000000000000000000000000000dead', '0000000000000000000000000000000000000000']
        .map((x) => call(a, '0x70a08231' + pad(x)).then(big).catch(() => 0n)));
      const burned = dead[0] + dead[1];
      return { address: a, is_contract: true, bytecode_bytes: (code.length - 2) / 2, name: t.name, symbol: t.symbol, decimals: t.decimals,
        total_supply: t.totalSupplyRaw != null ? units(t.totalSupplyRaw, t.decimals) : null,
        owner: owner, ownership_renounced: owner ? /^0x0{40}$/.test(owner) : null,
        burned_pct: t.totalSupplyRaw ? Math.round(Number((burned * 10000n) / (t.totalSupplyRaw || 1n))) / 100 : null,
        explorer: `${CHAIN.explorer}/token/${a}`, source: 'Robinhood Chain RPC',
        not_checked: 'holder distribution, verified source code, transfer taxes/honeypot simulation (needs an explorer API key or a DEX router simulation)' };
    } },
  wallet_balances: {
    def: { name: 'wallet_balances', description: "A wallet's ETH balance and token balances on Robinhood Chain, valued in USD. Checks the tokens given, plus the user's watchlist.",
      input_schema: S({ address, tokens: { type: 'array', items: { type: 'string' }, description: 'token addresses to check (optional)' } }, ['address']) },
    async run({ address: a, tokens = [] }, ctx) {
      const watch = store(ctx, 'watchlist.json', []).get().map((w) => w.token);
      const list = [...new Set([...tokens, ...watch].filter((t) => ADDR.test(t)).map((t) => t.toLowerCase()))].slice(0, 25);
      const eth = units(big(await rpc('eth_getBalance', [a, 'latest'])), 18);
      const rows = await Promise.all(list.map(async (t) => {
        const [meta, bal] = await Promise.all([erc20(t), call(t, '0x70a08231' + pad(a)).then(big).catch(() => 0n)]);
        return { token: t, symbol: meta.symbol, balance: units(bal, meta.decimals) };
      }));
      const priced = rows.filter((r) => r.balance > 0);
      const pairs = priced.length ? await tokenPairs(priced.map((r) => r.token)).catch(() => []) : [];
      for (const r of priced) { const p = pairs.find((x) => x.baseToken.address.toLowerCase() === r.token); if (p) r.value_usd = Math.round(r.balance * +p.priceUsd * 100) / 100; }
      return { address: a, eth, tokens: priced, checked_tokens: list.length, source: 'Robinhood Chain RPC + DexScreener prices' };
    } },
  market_trending: {
    def: { name: 'market_trending', description: 'Trending pools on Robinhood Chain right now (price, market cap, liquidity, 24h volume and change, buys/sells).',
      input_schema: S({ limit: { type: 'integer', description: '1-20, default 10' } }) },
    run: ({ limit = 10 }) => pools('trending_pools', Math.min(20, Math.max(1, limit))) },
  market_new_pools: {
    def: { name: 'market_new_pools', description: 'Newest pools created on Robinhood Chain (fresh launches).', input_schema: S({ limit: { type: 'integer', description: '1-20, default 10' } }) },
    run: ({ limit = 10 }) => pools('new_pools', Math.min(20, Math.max(1, limit))) },
  market_token: {
    def: { name: 'market_token', description: 'Live market data for a token on Robinhood Chain: price, liquidity, volume, buys/sells, price change, pair age, DEX, socials.',
      input_schema: S({ address }, ['address']) },
    async run({ address: a }) {
      const pairs = await tokenPairs([a]);
      if (!pairs.length) return { address: a, found: false, note: 'No DEX pair on Robinhood Chain found (not launched, still on a bonding curve, or wrong address).' };
      return { address: a, found: true, main_pair: pairRow(pairs[0]), other_pairs: pairs.slice(1, 4).map(pairRow), source: 'DexScreener' };
    } },
  market_search: {
    def: { name: 'market_search', description: 'Search Robinhood Chain tokens by name or ticker (e.g. to see if a ticker is already taken).',
      input_schema: S({ query: { type: 'string' } }, ['query']) },
    async run({ query }) {
      const j = await getJSON(`${DS}/search?q=${encodeURIComponent(query)}`, 60_000);
      const rows = (j.pairs || []).filter((p) => p.chainId === 'robinhood').slice(0, 10).map(pairRow);
      return { query, results: rows, source: 'DexScreener (Robinhood Chain only)' };
    } },
  nekopult_tokens: {
    def: { name: 'nekopult_tokens', description: 'Coins on Nekopult (DEMO DATA until the contracts launch): name, ticker, market cap, bonding-curve progress, status.',
      input_schema: S({ sort: { type: 'string', enum: ['trending', 'market_cap', 'newest', 'graduated'] }, limit: { type: 'integer' } }) },
    run({ sort = 'trending', limit = 10 }, ctx) {
      let t = demoTokens(ctx.siteRoot);
      if (sort === 'graduated') t = t.filter((x) => x.status === 'graduated');
      const key = { trending: (x) => -x.volume24h, market_cap: (x) => -x.marketCap, newest: (x) => x.createdMin, graduated: (x) => -x.marketCap }[sort];
      t = [...t].sort((a, b) => key(a) - key(b));
      return { demo_data: true, tokens: t.slice(0, Math.min(20, limit)).map((x) => pick(x, ['name', 'ticker', 'marketCap', 'change24h', 'progress', 'status', 'holders'])) };
    } },
  nekopult_prepare_launch: {
    def: { name: 'nekopult_prepare_launch', description: 'Create a launch draft the user opens in Nekopult (prefilled create form). Call it once the details are agreed.',
      input_schema: S({ name: { type: 'string' }, ticker: { type: 'string', description: '2-10 letters, no $' }, description: { type: 'string' },
        image_idea: { type: 'string' }, x_url: { type: 'string' }, telegram_url: { type: 'string' }, website: { type: 'string' },
        initial_buy_eth: { type: 'number' } }, ['name', 'ticker', 'description']) },
    run(input, ctx) {
      const d = { ...input, ticker: input.ticker.replace(/^\$/, '').toUpperCase().slice(0, 10), createdAt: new Date().toISOString() };
      const id = randomBytes(6).toString('hex');
      const st = store(ctx, 'drafts.json', {}); const all = st.get(); all[id] = d; st.set(all);
      const url = `/${ctx.lang}/nekopult/?draft=${id}`;
      ctx.emit({ kind: 'launch_draft', id, url, draft: d });
      return { draft_id: id, open_url: url, note: 'Shown to the user as a card with an "Open in Nekopult" button.' };
    } },
  prepare_trade: {
    def: { name: 'prepare_trade', description: 'Prepare a buy or sell for the user to review and sign in their own wallet. Uses the deepest Robinhood Chain pair for price and impact.',
      input_schema: S({ token: address, side: { type: 'string', enum: ['buy', 'sell'] }, amount: { type: 'number' },
        amount_unit: { type: 'string', enum: ['ETH', 'TOKEN', 'USD'] } }, ['token', 'side', 'amount', 'amount_unit']) },
    async run({ token, side, amount, amount_unit }, ctx) {
      const pairs = await tokenPairs([token]);
      if (!pairs.length) return { ok: false, note: 'No pair on Robinhood Chain for this token.' };
      const p = pairs[0], price = +p.priceUsd, ethUsd = +p.priceUsd / +p.priceNative || null;
      const usd = amount_unit === 'USD' ? amount : amount_unit === 'ETH' ? amount * (ethUsd || 0) : amount * price;
      const impact = p.liquidity?.usd ? Math.min(99, (usd / (p.liquidity.usd / 2)) * 100) : null;
      const card = { kind: 'trade', side, token, symbol: p.baseToken.symbol, pair: `${p.baseToken.symbol}/${p.quoteToken.symbol}`, dex: p.dexId,
        amount, amount_unit, value_usd: Math.round(usd * 100) / 100, price_usd: price,
        est_tokens: side === 'buy' && price ? Math.round((usd / price) * 1e4) / 1e4 : null,
        price_impact_pct: impact != null ? Math.round(impact * 100) / 100 : null,
        suggested_slippage_pct: impact == null ? 3 : impact < 1 ? 1 : impact < 3 ? 3 : 8, liquidity_usd: Math.round(p.liquidity?.usd || 0), url: p.url };
      ctx.emit(card);
      return { ...card, signing: 'Not available yet: in-dashboard signing goes live with Nekopult. The user can open the pair link to trade on the DEX.' };
    } },
  watchlist: {
    def: { name: 'watchlist', description: "The user's watchlist (tokens and alert rules). action: add | remove | list. The note holds the rule, e.g. 'alert if price > 0.002'.",
      input_schema: S({ action: { type: 'string', enum: ['add', 'remove', 'list'] }, token: address, note: { type: 'string' } }, ['action']) },
    async run({ action, token, note }, ctx) {
      const st = store(ctx, 'watchlist.json', []); let w = st.get();
      if (action === 'add' && token) { w = w.filter((x) => x.token.toLowerCase() !== token.toLowerCase()); w.push({ token, note: note || '', added: new Date().toISOString() }); st.set(w); }
      if (action === 'remove' && token) { w = w.filter((x) => x.token.toLowerCase() !== token.toLowerCase()); st.set(w); }
      return { watchlist: w };
    } },
};

// ---------------------------------------------------------------- input validation (inputs are streamed, so check them)
export function validate(def, input) {
  const s = def.input_schema;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input must be an object';
  for (const r of s.required || []) if (input[r] === undefined || input[r] === '') return `missing ${r}`;
  for (const [k, v] of Object.entries(input)) {
    const p = s.properties[k]; if (!p) return `unknown field ${k}`;
    const ok = p.type === 'string' ? typeof v === 'string' : p.type === 'number' ? typeof v === 'number' && isFinite(v)
      : p.type === 'integer' ? Number.isInteger(v) : p.type === 'array' ? Array.isArray(v) : p.type === 'boolean' ? typeof v === 'boolean' : true;
    if (!ok) return `${k} must be ${p.type}`;
    if (p.enum && !p.enum.includes(v)) return `${k} must be one of ${p.enum.join(', ')}`;
    if (p === address && !ADDR.test(v)) return `${k} must be a 0x address (40 hex characters)`;
  }
  return null;
}

// public market endpoints for the Nekopult page (same cache)
export const market = { trending: (n = 12) => pools('trending_pools', n), newest: (n = 12) => pools('new_pools', n) };
