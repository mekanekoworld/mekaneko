// Nekopult launchpad page. Coins are DEMO DATA until the contracts are live; the "Live on Robinhood Chain" table,
// chain status and wallet connection are real.
(() => {
  'use strict';
  const { lang, t, esc, usd, pct, nf, ago, short, toast, getJSON } = window.MK;
  MK.header('/nekopult/');
  const $ = (id) => document.getElementById(id);
  const CHAIN = { id: 4663, hex: '0x1237', name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://robinhoodchain.blockscout.com' };
  const A = (agent, qtext) => `/${lang}/agents/?agent=${agent}${qtext ? '&q=' + encodeURIComponent(qtext) : ''}`;
  let demo = { tokens: [], stats: {}, graduateAtUsd: 60000 }, cfg = {}, tab = 'trending', liveTab = 'trending', wallet = null;

  // ---------------------------------------------------------------- static copy
  $('npLede').textContent = t('Launch a meme coin on Robinhood Chain in one transaction. It trades on a bonding curve and graduates to Uniswap when the curve fills. Do your research with the agents first.',
    'Robinhood Chain でミームコインをワントランザクションでローンチ。ボンディングカーブで取引され、満タンになると Uniswap へ卒業。まずはエージェントとリサーチを。');
  $('npAsk').textContent = t('Ask the agents', 'エージェントに聞く'); $('npAsk').href = A('ryujin');
  $('npCreateTop').textContent = t('Create coin', 'コインを作成');
  $('npLiveTitle').textContent = t('Live on Robinhood Chain', 'Robinhood Chain のライブ');
  $('npSearch').placeholder = t('Search name or ticker', '名前・ティッカーで検索');
  $('npDemo').title = t('Example coins until Nekopult launches', 'Nekopult 公開までのサンプルです');
  const TABS = [['trending', t('Trending', 'トレンド')], ['market_cap', t('Market cap', '時価総額')], ['newest', t('Newest', '新着')], ['graduated', t('Graduated', '卒業')]];
  $('npTabs').innerHTML = TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('');
  $('npLiveTabs').innerHTML = [['trending', t('Trending pools', 'トレンド')], ['new', t('New pools', '新しいプール')]].map(([k, l]) => `<button data-live="${k}" aria-selected="${k === liveTab}">${l}</button>`).join('');

  function steps() {
    try { if (localStorage.getItem('np-steps-hidden') === '1') { $('npSteps').hidden = true; return; } } catch { /* ignore */ }
    const S = [
      ['1', t('Research with the agents', 'エージェントとリサーチ'), t('NEZU finds the trends, KONKON plans the launch, SHURU checks look-alikes for risks.', 'NEZU がトレンドを探し、KONKON が計画、SHURU が似たコインのリスクを確認。'), A('ryujin', t('Plan a meme coin launch on Nekopult for me.', 'Nekopult でミームコインを出す計画を立てて。')), t('Start with RYUJIN →', 'RYUJIN から始める →')],
      ['2', t('Launch on the curve', 'カーブでローンチ'), t('Name, ticker, picture, one transaction. Your coin trades on a bonding curve right away; no presale, no team allocation.', '名前・ティッカー・画像、ワントランザクション。すぐにボンディングカーブで取引開始。プレセールもチーム割当もなし。'), A('nishiki'), t('Draft it with NISHIKI →', 'NISHIKI と下書き →')],
      ['3', t('Graduate to Uniswap', 'Uniswap へ卒業'), t(`When the curve fills (about ${usd(demo.graduateAtUsd)} market cap), liquidity moves to a Uniswap pool on Robinhood Chain.`, `カーブが満タン（時価総額 約${usd(demo.graduateAtUsd)}）になると、流動性が Robinhood Chain の Uniswap プールへ移ります。`), A('chototsu'), t('Plan the hype with CHOTOTSU →', 'CHOTOTSU と宣伝計画 →')],
    ];
    $('npSteps').innerHTML = S.map(([n, h, p, href, cta]) => `<div class="np-step"><i>${n}</i><h3>${h}</h3><p>${p}</p><a href="${href}">${cta}</a></div>`).join('')
      + `<button class="close" type="button" aria-label="${t('Hide', '閉じる')}">${t('Hide', '閉じる')}</button>`;
    $('npSteps').querySelector('.close').onclick = () => { $('npSteps').hidden = true; try { localStorage.setItem('np-steps-hidden', '1'); } catch { /* ignore */ } };
  }

  // ---------------------------------------------------------------- MEKANEKO token bar
  async function tokenBar() {
    const kv = (k, v) => `<div class="np-kv"><span>${k}</span><strong>${v}</strong></div>`;
    let body = `${kv(t('Price', '価格'), '—')}${kv(t('Market cap', '時価総額'), '—')}${kv(t('24h volume', '24h出来高'), '—')}${kv(t('Liquidity', '流動性'), '—')}`;
    let pairUrl = '';
    if (cfg.ca) {
      try {
        const j = await getJSON('/api/market/token?address=' + encodeURIComponent(cfg.ca));
        if (j.found) { const p = j.main_pair; pairUrl = p.url;
          body = `${kv(t('Price', '価格'), `${usd(p.price_usd)} <small class="${p.change_24h_pct >= 0 ? 'up' : 'down'}">${pct(p.change_24h_pct)}</small>`)}${kv(t('Market cap', '時価総額'), usd(p.market_cap_usd || p.fdv_usd))}${kv(t('24h volume', '24h出来高'), usd(p.volume_24h_usd))}${kv(t('Liquidity', '流動性'), usd(p.liquidity_usd))}`; }
      } catch { /* keep dashes */ }
    }
    $('npToken').innerHTML = `<div class="who"><img src="/mekaneko/token-pfp.webp" alt="$MEKANEKO" width="44" height="44"><div><b>$MEKANEKO</b><div class="dim">${cfg.ca ? esc(short(cfg.ca)) + ' · ' + CHAIN.name : t('Launching soon · CA TBA', '近日ローンチ · CA 未定')}</div></div></div>
      ${body}<span class="grow"></span>
      <a class="btn btn--key" ${cfg.buyUrl ? `href="${esc(cfg.buyUrl)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${t('Buy $MEKANEKO', '$MEKANEKO を買う')}</a>
      ${pairUrl ? `<a class="btn" href="${esc(pairUrl)}" target="_blank" rel="noopener">DexScreener ↗</a>` : ''}`;
  }

  // ---------------------------------------------------------------- coin grid (demo)
  function sorted() {
    const qv = $('npSearch').value.trim().toLowerCase();
    let l = demo.tokens.filter((x) => !qv || x.name.toLowerCase().includes(qv) || x.ticker.toLowerCase().includes(qv));
    if (tab === 'graduated') l = l.filter((x) => x.status === 'graduated');
    const key = { trending: (x) => -x.volume24h, market_cap: (x) => -x.marketCap, newest: (x) => x.createdMin, graduated: (x) => -x.marketCap }[tab];
    return [...l].sort((a, b) => key(a) - key(b));
  }
  function bar(x) {
    const done = x.status === 'graduated';
    return `<div class="np-curve"><span>${done ? t('Graduated · Uniswap', '卒業 · Uniswap') : t('Bonding curve', 'ボンディングカーブ')}</span><span class="mono">${done ? '100%' : x.progress + '%'}</span></div>
      <div class="np-bar ${done ? 'done' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${done ? 100 : x.progress}"><span style="transform:scaleX(${(done ? 100 : x.progress) / 100})"></span></div>`;
  }
  function cards() {
    const l = sorted();
    $('npCards').innerHTML = l.length ? l.map((x, i) => `<button class="np-card" type="button" data-i="${demo.tokens.indexOf(x)}">
      <div class="np-card-top"><img src="${esc(x.img)}" alt="" width="64" height="64" loading="lazy"><div><h3>${esc(x.name)}</h3><span class="tick">$${esc(x.ticker)}</span></div></div>
      <div class="nums"><strong>${usd(x.marketCap)}</strong><span class="${x.change24h >= 0 ? 'up' : 'down'} mono">${pct(x.change24h)}</span></div>
      ${bar(x)}<div class="foot"><span>${nf(x.holders, 0)} ${t('holders', 'ホルダー')}</span><span>${ago(x.createdMin)}</span></div></button>`).join('')
      : `<div class="np-empty">${t('No coins match.', '該当するコインはありません。')}</div>`;
  }

  // ---------------------------------------------------------------- live table (real data)
  async function liveTable() {
    $('npLive').innerHTML = `<tbody><tr><td class="dim">${t('Loading…', '読み込み中…')}</td></tr></tbody>`;
    try {
      const j = await getJSON(liveTab === 'new' ? '/api/market/new' : '/api/market/trending');
      $('npLive').innerHTML = `<thead><tr><th>${t('Pool', 'プール')}</th><th class="r">${t('Price', '価格')}</th><th class="r">${t('Market cap', '時価総額')}</th><th class="r">${t('Liquidity', '流動性')}</th><th class="r">${t('24h vol', '24h出来高')}</th><th class="r">24h</th><th class="r">${t('Buys/Sells', '買い/売り')}</th><th class="r"></th></tr></thead><tbody>`
        + j.pools.map((p) => `<tr><td><span class="sym">${esc(p.symbol)}</span> <span class="dim">${esc(p.pool.split(' / ')[1] || '')} · ${esc((p.dex || '').replace(/-robinhood$/, ''))}</span></td>
          <td class="r">${usd(p.price_usd)}</td><td class="r">${usd(p.market_cap_usd || p.fdv_usd)}</td><td class="r">${usd(p.liquidity_usd)}</td><td class="r">${usd(p.volume_24h_usd)}</td>
          <td class="r ${p.change_24h_pct >= 0 ? 'up' : 'down'}">${pct(p.change_24h_pct)}</td><td class="r">${nf(p.buys_24h, 0)} / ${nf(p.sells_24h, 0)}</td>
          <td class="r"><span class="act"><a class="btn" href="${A('shuru', t('Run a risk check on ', 'リスクチェックをして: ') + p.token)}">${t('Check', 'チェック')}</a><a class="btn" href="${CHAIN.explorer}/token/${esc(p.token)}" target="_blank" rel="noopener">↗</a></span></td></tr>`).join('') + '</tbody>';
      $('npSource').textContent = t('Real data from GeckoTerminal, refreshed every minute. Not Nekopult coins.', 'GeckoTerminal の実データ（1分ごと更新）。Nekopult のコインではありません。');
    } catch {
      $('npLive').innerHTML = `<tbody><tr><td class="dim">${t('Live data is unavailable right now.', 'ライブデータを取得できません。')}</td></tr></tbody>`;
    }
  }

  // ---------------------------------------------------------------- rail
  async function chain() {
    const box = $('npChain');
    try {
      const s = await getJSON('/api/chain/status');
      box.innerHTML = `<h2>${t('Robinhood Chain', 'Robinhood Chain')}<span class="badge badge--live">LIVE</span></h2><div class="np-stat">
        <div class="np-kv"><span>${t('Block', 'ブロック')}</span><strong class="mono">${nf(s.latest_block, 0)}</strong></div>
        <div class="np-kv"><span>${t('Gas', 'ガス')}</span><strong class="mono">${nf(s.gas_price_gwei, 4)} gwei</strong></div></div>`;
    } catch { box.innerHTML = `<h2>${t('Robinhood Chain', 'Robinhood Chain')}</h2><p class="dim">${t('Status unavailable.', 'ステータスを取得できません。')}</p>`; }
  }
  const live = () => cfg.nekopultLive === true;
  function sample() {
    const el = $('npSample'); if (!el) return;
    el.hidden = live();
    el.innerHTML = `<b>${t('SAMPLE COINS', 'サンプルのコイン')}</b> ${t('Nekopult is not live yet. These coins, prices and holders are made up to show how it will work. Nothing here can be bought.',
      'Nekopult はまだ稼働していません。ここにあるコイン、価格、ホルダーは、仕組みを見せるための架空のものです。購入はできません。')}`;
  }
  function stats() {
    if (!live()) { $('npStats').hidden = true; return; }
    const s = demo.stats || {};
    $('npStats').innerHTML = `<h2>${t('Nekopult so far', 'Nekopult の実績')}<span class="badge badge--demo">DEMO</span></h2><div class="np-stat">
      <div class="np-kv"><span>${t('Coins', 'コイン')}</span><strong>${nf(s.coins, 0)}</strong></div><div class="np-kv"><span>${t('Graduated', '卒業')}</span><strong>${nf(s.graduated, 0)}</strong></div>
      <div class="np-kv"><span>${t('24h volume', '24h出来高')}</span><strong>${usd(s.volume24hUsd)}</strong></div><div class="np-kv"><span>${t('Holders', 'ホルダー')}</span><strong>${nf(s.holders, 0)}</strong></div></div>`;
  }
  const feedItems = [];
  function feed() {
    if (!live()) { $('npFeed').hidden = true; return; }
    const pickT = () => demo.tokens[Math.floor(Math.random() * demo.tokens.length)];
    const kinds = [() => { const x = pickT(); return [x, `${short('0x' + Math.random().toString(16).slice(2, 10) + 'abcd')} ${t('bought', 'が購入')} <b>${nf(Math.random() * 0.5 + 0.01, 3)} ETH</b> $${esc(x.ticker)}`]; },
      () => { const x = pickT(); return [x, `${short('0x' + Math.random().toString(16).slice(2, 10) + 'beef')} ${t('sold', 'が売却')} $${esc(x.ticker)}`]; },
      () => { const x = pickT(); return [x, `$${esc(x.ticker)} ${t('hit', 'が到達')} <b>${Math.min(99, x.progress + 1)}%</b> ${t('of the curve', 'カーブ')}`]; }];
    const add = () => { const [x, txt] = kinds[Math.floor(Math.random() * kinds.length)](); feedItems.unshift([x, txt, Date.now()]); feedItems.length = Math.min(feedItems.length, 7); draw(); };
    const draw = () => { $('npFeed').innerHTML = `<h2>${t('Live on Nekopult', 'Nekopult ライブ')}<span class="badge badge--demo">DEMO</span></h2><div class="np-feed">`
      + feedItems.map(([x, txt, ts]) => `<div><img src="${esc(x.img)}" alt="" width="26" height="26"><span>${txt}</span><span class="t">${Math.max(1, Math.round((Date.now() - ts) / 1000))}s</span></div>`).join('') + '</div>'; };
    for (let i = 0; i < 5; i++) add();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(add, 4200);
  }
  function agents() {
    const L = [['nezu', 'NEZU', t('Find trends before you launch', 'ローンチ前にトレンドを探す')], ['shuru', 'SHURU', t('Risk-check any token', 'トークンのリスクチェック')],
      ['nishiki', 'NISHIKI', t('Draft your launch', 'ローンチの下書き')], ['toramaru', 'TORAMARU', t('Prepare a trade', 'トレードの準備')]];
    $('npAgents').innerHTML = `<h2>${t('Ask the agents', 'エージェントに聞く')}</h2><div class="np-agents">${L.map(([id, n, d]) => `<a href="${A(id)}"><img src="/mekaneko/agents/${id}.webp" alt="" width="36" height="36"><div><b>${n}</b><span>${d}</span></div></a>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- wallet (EIP-1193)
  function walletBtn() { $('npWallet').textContent = wallet ? `${short(wallet.address)} · ${nf(wallet.eth, 4)} ETH` : t('Connect wallet', 'ウォレット接続'); }
  async function connect() {
    const eth = window.ethereum;
    if (!eth) { toast(t('No wallet found. Install MetaMask or Rabby.', 'ウォレットが見つかりません。MetaMask か Rabby を入れてください。')); return; }
    if (wallet) { wallet = null; walletBtn(); return; }
    try {
      const [address] = await eth.request({ method: 'eth_requestAccounts' });
      try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }] }); }
      catch (e) { if (e.code === 4902) await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN.hex, chainName: CHAIN.name,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer] }] }); else throw e; }
      const bal = await eth.request({ method: 'eth_getBalance', params: [address, 'latest'] });
      wallet = { address, eth: Number(BigInt(bal)) / 1e18 }; walletBtn();
      toast(t('Wallet connected on Robinhood Chain', 'Robinhood Chain でウォレット接続済み'));
    } catch (e) { toast(e.message || String(e)); }
  }
  if (window.ethereum?.on) { window.ethereum.on('accountsChanged', () => { wallet = null; walletBtn(); }); window.ethereum.on('chainChanged', () => { wallet = null; walletBtn(); }); }

  // ---------------------------------------------------------------- create dialog
  const contractsLive = () => !!(cfg.nekopult && cfg.nekopult.factory);
  function create(draft = {}) {
    const d = $('npCreate');
    d.innerHTML = `<form method="dialog" id="npForm" novalidate><button class="x" value="cancel" aria-label="${t('Close', '閉じる')}">✕</button>
      <h2 class="display" id="npCreateTitle">${t('Create a coin', 'コインを作成')}</h2>
      ${contractsLive() ? '' : `<div class="np-warn">${t('Nekopult contracts are not live yet. You can prepare and save your coin now, and have NISHIKI review it.', 'Nekopult のコントラクトはまだ公開前です。今のうちに準備・保存して、NISHIKI に確認してもらえます。')}</div>`}
      <div class="np-img"><div class="prev" id="npPrev">${t('Image', '画像')}</div><div class="np-field"><label for="npFile">${t('Picture', '画像')}</label><input id="npFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><small>${esc(draft.image_idea ? t('Idea: ', 'アイデア: ') + draft.image_idea : t('Square, at least 512 px.', '正方形・512px 以上'))}</small></div></div>
      <div class="np-two"><div class="np-field"><label for="npName">${t('Name', '名前')}</label><input id="npName" maxlength="32" required value="${esc(draft.name || '')}"></div>
      <div class="np-field"><label for="npTicker">${t('Ticker', 'ティッカー')}</label><input id="npTicker" maxlength="10" required value="${esc(draft.ticker || '')}" placeholder="NYAN"></div></div>
      <div class="np-field"><label for="npDesc">${t('Description', '説明')}</label><textarea id="npDesc" rows="3" maxlength="400">${esc(draft.description || '')}</textarea></div>
      <div class="np-two"><div class="np-field"><label for="npX">X</label><input id="npX" type="url" placeholder="https://x.com/…" value="${esc(draft.x_url || '')}"></div>
      <div class="np-field"><label for="npTg">Telegram</label><input id="npTg" type="url" placeholder="https://t.me/…" value="${esc(draft.telegram_url || '')}"></div></div>
      <div class="np-two"><div class="np-field"><label for="npWeb">${t('Website', 'ウェブサイト')}</label><input id="npWeb" type="url" placeholder="https://" value="${esc(draft.website || '')}"></div>
      <div class="np-field"><label for="npBuy">${t('Initial buy (ETH, optional)', '初回購入 (ETH・任意)')}</label><input id="npBuy" type="number" min="0" step="0.001" value="${draft.initial_buy_eth ?? ''}"><small>${t('Buying first protects you from snipers.', '最初に買うとスナイパー対策になります。')}</small></div></div>
      <div class="np-actions"><button class="btn" type="button" id="npReview">${t('Ask NISHIKI to review', 'NISHIKI に確認してもらう')}</button>
      <button class="btn" type="button" id="npSave">${t('Save draft', '下書き保存')}</button>
      <button class="btn btn--key" type="button" id="npLaunch" ${contractsLive() ? '' : 'disabled'} title="${t('Opens when the contracts are live', 'コントラクト公開後に有効')}">${t('Launch coin', 'ローンチ')}</button></div></form>`;
    const val = () => ({ name: $('npName').value.trim(), ticker: $('npTicker').value.trim().replace(/^\$/, '').toUpperCase(), description: $('npDesc').value.trim(),
      x_url: $('npX').value.trim(), telegram_url: $('npTg').value.trim(), website: $('npWeb').value.trim(), initial_buy_eth: $('npBuy').value ? +$('npBuy').value : null });
    $('npFile').onchange = () => { const f = $('npFile').files[0]; if (!f) return; const u = URL.createObjectURL(f); $('npPrev').innerHTML = `<img src="${u}" alt="">`; };
    $('npSave').onclick = () => { try { localStorage.setItem('np-draft', JSON.stringify(val())); toast(t('Draft saved on this device', 'この端末に下書きを保存しました')); } catch { toast('—'); } };
    $('npReview').onclick = () => { const v = val();
      location.href = A('nishiki', t(`Review my Nekopult coin before launch: name "${v.name}", ticker $${v.ticker}, description "${v.description}", initial buy ${v.initial_buy_eth ?? 0} ETH. Is the ticker free and what should I improve?`,
        `ローンチ前に私の Nekopult コインを確認して：名前「${v.name}」、ティッカー $${v.ticker}、説明「${v.description}」、初回購入 ${v.initial_buy_eth ?? 0} ETH。ティッカーは空いてる？改善点は？`)); };
    $('npLaunch').onclick = () => { if (!wallet) { connect(); return; } toast(t('Launching is not wired yet.', 'ローンチ機能は準備中です。')); };
    d.showModal();
  }

  // ---------------------------------------------------------------- coin detail drawer
  function detail(x) {
    const d = $('npDetail');
    d.innerHTML = `<div class="in"><button class="x" type="button" aria-label="${t('Close', '閉じる')}">✕</button>
      <div class="np-dhead"><img src="${esc(x.img)}" alt="" width="80" height="80"><div><h2 class="display">${esc(x.name)}</h2><span class="muted">$${esc(x.ticker)} · ${t('by', '作成')} ${esc(x.creator)}</span> <span class="badge badge--demo">DEMO</span></div></div>
      <p class="muted">${esc(x.description)}</p>
      <div class="np-stat"><div class="np-kv"><span>${t('Market cap', '時価総額')}</span><strong>${usd(x.marketCap)}</strong></div><div class="np-kv"><span>24h</span><strong class="${x.change24h >= 0 ? 'up' : 'down'}">${pct(x.change24h)}</strong></div>
      <div class="np-kv"><span>${t('Holders', 'ホルダー')}</span><strong>${nf(x.holders, 0)}</strong></div><div class="np-kv"><span>${t('Created', '作成')}</span><strong>${ago(x.createdMin)}</strong></div></div>
      ${bar(x)}<p class="dim">${x.status === 'graduated' ? t('This coin filled its curve and trades on Uniswap.', 'このコインはカーブを満たし、Uniswap で取引されています。') : t(`About ${usd(Math.max(0, demo.graduateAtUsd - x.marketCap))} more market cap to graduate.`, `卒業まであと時価総額 約${usd(Math.max(0, demo.graduateAtUsd - x.marketCap))}。`)}</p>
      <canvas class="np-chart" id="npChart" width="900" height="320" aria-label="${t('Price chart (demo)', '価格チャート（デモ）')}"></canvas>
      <div class="np-trade"><div class="np-tabs"><button aria-selected="true">${t('Buy', '購入')}</button><button aria-selected="false">${t('Sell', '売却')}</button></div>
      <div class="np-field"><label for="npAmt">${t('Amount (ETH)', '数量 (ETH)')}</label><input id="npAmt" type="number" min="0" step="0.001" placeholder="0.05"></div>
      <button class="btn btn--key" type="button" disabled>${t('Trade (opens at launch)', '取引（ローンチ後）')}</button></div>
      <div class="np-actions"><a class="btn" href="${A('konkon', t(`Is $${x.ticker} on Nekopult a good play? It is at ${usd(x.marketCap)} market cap, ${x.progress}% of the bonding curve, ${x.holders} holders.`, `Nekopult の $${x.ticker} はどう？時価総額 ${usd(x.marketCap)}、カーブ ${x.progress}%、ホルダー ${x.holders}。`))}">${t('Ask KONKON', 'KONKON に聞く')}</a>
      <a class="btn" href="${A('chototsu', t(`Write a hype thread for $${x.ticker} (${x.name}).`, `$${x.ticker}（${x.name}）の宣伝スレッドを書いて。`))}">${t('Ask CHOTOTSU', 'CHOTOTSU に聞く')}</a></div></div>`;
    d.querySelector('.x').onclick = () => d.close();
    d.showModal(); drawChart(x);
  }
  function drawChart(x) {
    const c = $('npChart'), g = c.getContext('2d'), W = c.width, H = c.height;
    let seed = [...x.ticker].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const n = 60, pts = []; let v = 1; for (let i = 0; i < n; i++) { v *= 1 + (rnd() - 0.42) * 0.12; pts.push(v); }
    const end = x.marketCap, k = end / pts[n - 1]; const ys = pts.map((p) => p * k); const lo = Math.min(...ys), hi = Math.max(...ys);
    g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(208,208,208,.08)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (H * i) / 4); g.lineTo(W, (H * i) / 4); g.stroke(); }
    const X = (i) => 16 + (i / (n - 1)) * (W - 32), Y = (y) => H - 20 - ((y - lo) / (hi - lo || 1)) * (H - 40);
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, 'rgba(203,90,12,.35)'); grad.addColorStop(1, 'rgba(203,90,12,0)');
    g.beginPath(); ys.forEach((y, i) => (i ? g.lineTo(X(i), Y(y)) : g.moveTo(X(i), Y(y)))); g.lineTo(X(n - 1), H); g.lineTo(X(0), H); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); ys.forEach((y, i) => (i ? g.lineTo(X(i), Y(y)) : g.moveTo(X(i), Y(y)))); g.strokeStyle = '#e46a14'; g.lineWidth = 3; g.stroke();
  }

  // ---------------------------------------------------------------- wiring
  $('npTabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; [...$('npTabs').children].forEach((x) => x.setAttribute('aria-selected', x === b)); cards(); };
  $('npLiveTabs').onclick = (e) => { const b = e.target.closest('[data-live]'); if (!b) return; liveTab = b.dataset.live; [...$('npLiveTabs').children].forEach((x) => x.setAttribute('aria-selected', x === b)); liveTable(); };
  $('npSearch').oninput = cards;
  $('npCards').onclick = (e) => { const b = e.target.closest('.np-card'); if (b) detail(demo.tokens[+b.dataset.i]); };
  $('npCreateTop').onclick = () => { let d = {}; try { d = JSON.parse(localStorage.getItem('np-draft')) || {}; } catch { /* none */ } create(d); };
  $('npWallet').onclick = connect;
  for (const d of [$('npCreate'), $('npDetail')]) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

  (async () => {
    walletBtn();
    try { demo = await getJSON('/mekaneko/nekopult-demo.json'); } catch { /* empty */ }
    try { cfg = await getJSON('/mekaneko/config.json'); } catch { cfg = {}; }
    steps(); sample(); cards(); stats(); feed(); agents(); tokenBar(); liveTable(); chain();
    setInterval(chain, 15000); setInterval(live, 60000);
    const draftId = new URLSearchParams(location.search).get('draft');
    if (draftId) { try { create(await getJSON('/api/nekopult/draft?id=' + encodeURIComponent(draftId))); } catch { toast(t('Draft not found', '下書きが見つかりません')); } }
  })();
})();
