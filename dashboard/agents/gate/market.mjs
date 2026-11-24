// Stand-in for Troya's server/market.mjs: the Gate only asks it for the ETH price and a token's pool depth.
// Both come from DexScreener (public API), cached for 30 seconds.
const cache = new Map();
async function cached(key, ms, fn) { const c = cache.get(key); if (c && Date.now() - c.at < ms) return c.v; const v = await fn(); cache.set(key, { at: Date.now(), v }); return v; }
async function pairs(addr) {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, { signal: AbortSignal.timeout(8000) });
  const j = await r.json(); return (j.pairs || []).filter((p) => p.chainId === 'robinhood').sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
}
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
export async function getEthUsd() { return cached('eth', 30_000, async () => { const p = (await pairs(WETH))[0]; return p ? Number(p.priceUsd) || null : null; }); }
export function indexRow() { return null; }
export async function getRobinhoodToken(token) {
  return cached(`t:${String(token).toLowerCase()}`, 30_000, async () => { const p = (await pairs(token))[0]; return p ? { token: { liquidityUsd: p.liquidity?.usd || null } } : null; });
}
// Sentry's paper-liquidity guard: every Robinhood Chain pair of a token (DexScreener, cached 30 s)
export async function dsTokenPairs(token) { return cached(`p:${String(token).toLowerCase()}`, 30_000, () => pairs(token)); }
