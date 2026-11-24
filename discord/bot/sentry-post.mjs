// KOKEKO's Sentry posts for Discord: one embed per coin that passed with real buying, one daily recap.
// S = vendor/gate/sentry.mjs (ported from Troya Agent, MIT).
const ethTxt = (v) => (v == null ? '–' : v < 1 ? v.toFixed(3) : v.toFixed(2));
const mins = (ms) => (ms < 90e3 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60e3)} min`);
export function sentryEmbed(r, S) {
  const ck = Object.fromEntries(r.checks.map((c) => [c.key, c]));
  const bits = [ck.sim && `Sim ${ck.sim.status === 'pass' ? 'ok' : 'skipped'}`, ck.sell && `Test sell ${ck.sell.status === 'pass' ? (/partial/i.test(ck.sell.detail) ? 'ok (partial)' : 'ok') : 'skipped'}`,
    ck.tax && `Tax ${ck.tax.status === 'pass' ? 'none' : ck.tax.status === 'skip' ? 'not measured' : ck.tax.detail}`, ck.fee && `Fees ${ck.fee.detail}`].filter(Boolean);
  const p = r.pons || {};
  const lines = [
    `**Passed the Gate**, checked ${mins(r.ageMs || 0)} after launch.`,
    r.buyers ? `**${r.buyers.organic} independent buyers** (wallets that buy every new coin are not counted).` : null,
    `Curve: ${ethTxt(p.raised)} ${p.pair?.symbol || 'ETH'} raised · ${p.progressPct != null ? p.progressPct.toFixed(p.progressPct < 1 ? 2 : 1) : '–'}% to graduation${p.fees ? ` · creator tax ${(p.fees.creatorTaxBps / 100).toFixed(2)}%` : ''}`,
    bits.join(' · '),
    r.alsoTicker ? `⚠️ Another coin used this ticker earlier today (${S.short(r.alsoTicker.token)}): check the address.` : null,
    `\`${r.token}\``,
    `[Pons](https://ponsfamily.com/launchpad/${r.token.toLowerCase()}) · [Blockscout](https://robinhoodchain.blockscout.com/token/${r.token}) · [DexScreener](https://dexscreener.com/robinhood/${r.token})`,
  ].filter(Boolean);
  const cid = S.logoCid(r.profile?.logo);
  return { color: 0x3DDC84,
            title: `🛰️ New on Pons · ${r.symbol ? '$' + r.symbol : 'unnamed'}${r.name && r.name.toUpperCase() !== (r.symbol || '').toUpperCase() ? ` · ${r.name}` : ''}`.slice(0, 250),
            description: lines.join('\n').slice(0, 4000), ...(cid ? { thumbnail: { url: `https://ipfs.io/ipfs/${cid}` } } : {}),
            footer: { text: 'KOKEKO Sentry · automated checks, not endorsements. Every call is graded in public: app.mekaneko.com/en/record · Not financial advice. Never share your seed phrase.' } };
}
export function recapEmbed(d, S) {
  const checked = d.passed + d.caution + d.failed;
  return { color: 0x35D7FF, title: '🛰️ KOKEKO Sentry · last 24 hours',
            description: `${d.seen} Pons launches seen. ${checked} had buyers and went through the Gate: ${d.passed} passed · ${d.caution} caution · ${d.failed} failed.\n`
              + `${d.posted} passed with real buying (at least ${S.MIN_POST} ETH from ${S.MIN_BUYERS}+ independent wallets, no copies) and were posted here.\n`
              + `${d.nobuys} had an empty or dust-only curve, so there was nothing to test.\n\nCheck any coin yourself: ask SHURU with /ask or /check.`,
            footer: { text: 'Automated checks, not endorsements.' } };
}

// Watchfire alerts (vendor/gate/watchfire.mjs, ported from Troya Agent, MIT): big wallets moving in a coin Sentry posted, or in $MEKANEKO
const WF = {
  whale: { icon: '🐋', color: 0xFF3B30, title: 'Whale sale', note: 'One wallet sold a big slice of the supply in a single trade.' },
  gather: { icon: '🔥', color: 0xFF3B30, title: 'Wallets gathering coins', note: 'Many wallets sent their coins to one wallet within seconds, the usual step before a big sale.' },
  velocity: { icon: '⚠️', color: 0xFF8A00, title: 'Holders selling fast', note: 'Sellers far outnumber buyers right now.' },
  weight: { icon: '⚖️', color: 0xF5B342, title: 'Weight in few hands', note: 'A large share of the supply sits with one wallet or came through one trading bot.' },
};
export function watchfireEmbed(a) {
  const k = WF[a.kind] || WF.whale, ex = 'https://robinhoodchain.blockscout.com';
  const why = a.reasons?.includes('mekaneko') ? '$MEKANEKO' : 'a coin KOKEKO posted in the last 24 hours';
  const lines = [
    `**${k.title}:** ${a.detail}.`,
    k.note,
    a.wallet ? `Wallet: [${a.wallet.slice(0, 6)}…${a.wallet.slice(-4)}](${ex}/address/${a.wallet})` : null,
    a.tx && /^0x[0-9a-f]{64}$/i.test(a.tx) ? `Transaction: [${a.tx.slice(0, 10)}…](${ex}/tx/${a.tx})` : null,
    `\`${a.token}\``,
    `[Pons](https://ponsfamily.com/launchpad/${a.token.toLowerCase()}) · [Blockscout](${ex}/token/${a.token}) · [DexScreener](https://dexscreener.com/robinhood/${a.token})${a.receipt ? ` · [Receipt](https://app.mekaneko.com/en/record/?r=${a.receipt})` : ''}`,
    `_Watched because it is ${why}. Ask SHURU with /ask before you trade it._`,
  ].filter(Boolean);
  return { color: k.color, title: `${k.icon} Watchfire · ${a.symbol ? '$' + a.symbol : 'unnamed'}`.slice(0, 250), description: lines.join('\n').slice(0, 4000),
    footer: { text: 'KOKEKO Watchfire · patterns, not proof. Not financial advice. Never share your seed phrase.' } };
}
