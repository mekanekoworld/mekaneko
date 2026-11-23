// Market cards for Discord, no AI: NEZU's /trend (top trending pools) and KOKEKO's daily Market Omikuji (a fortune card drawn from
// real GeckoTerminal data). Both read the same feed as the agents (vendor/tools.mjs › market).
import { market } from './vendor/tools.mjs';

const usd = (n) => (n == null ? 'n/a' : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);
const pct = (n) => `${n >= 0 ? '+' : ''}${(+n || 0).toFixed(1)}%`;
const utc = (d = new Date()) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const RISK = 'A reading of the market, not financial advice. Never share your seed phrase.';

// pools with real trading (a thin pool's percentage says nothing)
const liquid = (rows) => rows.filter((r) => (r.liquidity_usd || 0) >= 20_000 && (r.volume_24h_usd || 0) >= 5_000);

export async function trendCard(n = 3) {
  const { pools } = await market.trending(12);
  const top = liquid(pools).slice(0, n);
  if (!top.length) return { color: 0x9b5cff, title: '🐭 NEZU · trending on Robinhood Chain', description: 'Chu! No pool with real liquidity is trending right now. Try again in a bit.' };
  return {
    color: 0x9b5cff, title: '🐭 NEZU · trending on Robinhood Chain',
    description: 'Chu! The pools trading hardest right now:',
    fields: top.map((r, i) => ({ name: `${i + 1}. ${r.symbol} (${r.pool})`,
      value: `${pct(r.change_24h_pct)} in 24h · volume ${usd(r.volume_24h_usd)} · liquidity ${usd(r.liquidity_usd)}${r.market_cap_usd ? ` · mcap ${usd(r.market_cap_usd)}` : ''}` })),
    footer: { text: `Source: GeckoTerminal, ${utc()} · ${RISK}` },
  };
}

// the fortune: from the mood of the liquid trending pools (volume-weighted 24h change and the share of pools up)
const FORTUNES = [
  [15, '大吉 DAIKICHI', 'Great blessing', 0xF5B342, 'The chain is running hot. Take profit on the way up, and never chase a green candle.'],
  [5, '吉 KICHI', 'Blessing', 0x3DDC84, 'More up than down. A good day to research before you buy.'],
  [-5, '小吉 SHŌKICHI', 'Small blessing', 0x35D7FF, 'A quiet market. Patience is a strategy too.'],
  [-15, '末吉 SUEKICHI', 'Blessing to come', 0xCB5A0C, 'Red across the board. Check liquidity twice before anything else.'],
  [-Infinity, '凶 KYŌ', 'Bad luck', 0xFF5D5D, 'A rough day. Sit on your hands and keep your seed phrase to yourself.'],
];
export async function omikujiCard(now = new Date()) {
  const { pools } = await market.trending(20);
  const rows = liquid(pools);
  if (rows.length < 3) return null;                                  // not enough real data: no fortune today
  const vol = rows.reduce((a, r) => a + r.volume_24h_usd, 0) || 1;
  const mood = rows.reduce((a, r) => a + r.change_24h_pct * r.volume_24h_usd, 0) / vol;
  const up = rows.filter((r) => r.change_24h_pct > 0).length;
  const [, kanji, meaning, color, line] = FORTUNES.find(([min]) => mood >= min);
  const lucky = [...rows].sort((a, b) => b.change_24h_pct - a.change_24h_pct)[0];
  const careful = [...rows].sort((a, b) => a.change_24h_pct - b.change_24h_pct)[0];
  return {
    color, title: `🐔 KOKEKO's Market Omikuji · ${kanji}`,
    description: `**${meaning}.** ${line}`,
    fields: [
      { name: 'Market mood', value: `${pct(mood)} (volume-weighted, 24h) · ${up} of ${rows.length} trending pools up`, inline: false },
      { name: 'Lucky coin', value: `${lucky.symbol}: ${pct(lucky.change_24h_pct)} in 24h, liquidity ${usd(lucky.liquidity_usd)}`, inline: true },
      { name: 'Handle with care', value: `${careful.symbol}: ${pct(careful.change_24h_pct)} in 24h, liquidity ${usd(careful.liquidity_usd)}`, inline: true },
    ],
    footer: { text: `Drawn from GeckoTerminal data, ${utc(now)} · ${RISK}` },
  };
}
