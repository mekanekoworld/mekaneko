// Agents console: pick an agent, chat, watch it use its tools (streamed from /api/agents/chat).
(() => {
  'use strict';
  const { lang, t, esc, md, toast, getJSON } = window.MK;
  MK.header('/team');
  const $ = (id) => document.getElementById(id);
  const ORDER = ['ryujin', 'nezu', 'konkon', 'shuru', 'nishiki', 'chototsu', 'meemee', 'kokeko', 'toramaru', 'kaeru', 'pyon', 'gyudon', 'hayate', 'ukki', 'hachi'];
  const SUGGEST = {
    ryujin: [['Plan a meme coin launch on Nekopult for me, start to finish.', 'Nekopult でミームコインを出す計画を最初から最後まで立てて。'], ['What is trending on Robinhood Chain and what should I launch?', 'Robinhood Chain で今何が流行っていて、何を出すべき？'], ['Check this token for risks: 0x020bfc650a365f8bb26819deaabf3e21291018b4', 'このトークンのリスクを調べて: 0x020bfc650a365f8bb26819deaabf3e21291018b4']],
    nezu: [['Give me a trend report for Robinhood Chain today.', '今日の Robinhood Chain のトレンドレポートをちょうだい。'], ['Which meme narratives are heating up on X this week?', '今週 X で盛り上がっているミームのテーマは？'], ['Find 3 meme coin ideas nobody has launched yet.', 'まだ誰も出していないミームコインのアイデアを3つ。']],
    konkon: [['I want to launch a cat meme coin. Make me a launch plan.', '猫のミームコインを出したい。ローンチ計画を作って。'], ['How big should my initial buy be, and why?', '最初の購入額はいくらがいい？理由も。'], ['What makes a coin graduate fast on a bonding curve?', 'ボンディングカーブで早く卒業するコインの条件は？']],
    shuru: [['Run a risk check on 0x020bfc650a365f8bb26819deaabf3e21291018b4', '0x020bfc650a365f8bb26819deaabf3e21291018b4 のリスクチェックをして。'], ['What are the red flags of a honeypot token?', 'ハニーポットトークンの危険サインは？'], ['Check the newest pools for anything suspicious.', '最新のプールに怪しいものがないか調べて。']],
    nishiki: [['Help me launch my first coin on Nekopult.', 'Nekopult で初めてのコインを出したい。手伝って。'], ['Is the ticker NYAN already taken on Robinhood Chain?', 'Robinhood Chain でティッカー NYAN はもう使われてる？'], ['Explain the bonding curve and graduation simply.', 'ボンディングカーブと卒業をやさしく説明して。']],
    chototsu: [['Write a launch thread for X for my coin $NYAN.', '$NYAN のローンチ用 X スレッドを書いて。'], ['Make a 7-day content calendar for a new meme coin.', '新しいミームコインの7日間の投稿カレンダーを作って。'], ['Write a Telegram announcement for launch day.', 'ローンチ当日の Telegram 告知文を書いて。']],
    meemee: [['Give me 10 meme ideas for a taiyaki-themed coin.', 'たい焼きテーマのコインのミーム案を10個。'], ['Name our community and give us a chant.', 'コミュニティの名前とコールを考えて。'], ['Describe a sticker pack for my coin.', '私のコインのステッカーパックを考えて。']],
    kokeko: [["What's the latest news on Robinhood Chain?", 'Robinhood Chain の最新ニュースは？'], ['Add 0x020bfc650a365f8bb26819deaabf3e21291018b4 to my watchlist.', '0x020bfc650a365f8bb26819deaabf3e21291018b4 をウォッチリストに追加して。'], ['Brief me on my watchlist.', 'ウォッチリストのまとめをちょうだい。']],
    toramaru: [['Prepare a buy of 0.05 ETH of 0x020bfc650a365f8bb26819deaabf3e21291018b4', '0x020bfc650a365f8bb26819deaabf3e21291018b4 を 0.05 ETH 分買う準備をして。'], ['How much slippage should I use for a thin pool?', '流動性が薄いプールのスリッページは？'], ['What is the price impact of selling $500 of CASHCAT?', 'CASHCAT を $500 売ったら価格への影響は？']],
    kaeru: [['Show the portfolio of 0x000000000000000000000000000000000000dEaD', '0x000000000000000000000000000000000000dEaD のポートフォリオを見せて。'], ['How much ETH should I keep for gas on Robinhood Chain?', 'Robinhood Chain のガス用に ETH はどれくらい残すべき？'], ['Make me a take-profit plan.', '利確プランを作って。']],
    pyon: [['Alert me if CASHCAT drops below $0.04.', 'CASHCAT が $0.04 を下回ったら知らせて。'], ['Check all my alert rules now.', '全部のアラート条件を今チェックして。'], ['What can you automate for me?', '何を自動化できる？']],
    gyudon: [['Is Robinhood Chain healthy right now?', 'Robinhood Chain は今正常？'], ['How do I add Robinhood Chain to my wallet?', 'ウォレットに Robinhood Chain を追加するには？'], ['Is 0x020bfc650a365f8bb26819deaabf3e21291018b4 a contract?', '0x020bfc650a365f8bb26819deaabf3e21291018b4 はコントラクト？']],
    hayate: [['How do I bridge ETH to Robinhood Chain?', 'Robinhood Chain に ETH をブリッジする方法は？'], ['What does bridging from Arbitrum cost right now?', '今 Arbitrum からブリッジするといくらかかる？'], ['How do I spot a fake bridge site?', '偽のブリッジサイトの見分け方は？']],
    ukki: [['Write a script that watches new pools on Robinhood Chain.', 'Robinhood Chain の新しいプールを監視するスクリプトを書いて。'], ['Write a simple ERC-20 meme token contract and explain it.', 'シンプルな ERC-20 ミームトークンのコントラクトを書いて説明して。'], ['Analyze these prices and plot a chart: 1,1.2,0.9,1.5,2.1', 'この価格を分析してチャートにして: 1,1.2,0.9,1.5,2.1']],
    hachi: [['How does Nekopult work?', 'Nekopult の仕組みは？'], ['My transaction failed. What should I check?', 'トランザクションが失敗した。何を確認すればいい？'], ['Which agent should I ask about launching?', 'ローンチについてはどのエージェントに聞けばいい？']],
  };
  const TOOLS = {
    ryujin: ['All 14 agents', 'Robinhood Chain market data', 'Web search'], nezu: ['Robinhood Chain pools (GeckoTerminal)', 'Token search (DexScreener)', 'Web search'],
    konkon: ['Robinhood Chain market data', 'Web search'], shuru: ['The Gate (simulated buy and sell)', 'Watchfire (whale alerts)', 'Robinhood Chain RPC (contract reads)', 'DexScreener', 'Web search'],
    nishiki: ['Nekopult launch drafts', 'Ticker check (DexScreener)', 'Web search'], chototsu: ['Web search', 'Market data'], meemee: ['Web search'],
    kokeko: ['Sentry (new Pons coins)', 'Watchfire (whale alerts)', 'Web search', 'Watchlist'], toramaru: ['The Gate (simulated buy and sell)', 'Live prices & liquidity', 'Wallet balances', 'Trade preview'], kaeru: ['Wallet balances (RPC)', 'Live prices'],
    pyon: ['Watchlist rules', 'Live prices'], gyudon: ['Robinhood Chain RPC'], hayate: ['Web search', 'Robinhood Chain RPC'], ukki: ['Code sandbox'], hachi: ['Web search', 'Chain status'],
  };
  const TOOL_LABEL = {
    web_search: ['Searching the web', 'ウェブ検索'], web_fetch: ['Reading a page', 'ページを読む'], code_execution: ['Running code', 'コード実行'],
    gate_check: ['Running the Gate', 'Gate チェック'], service_status: ['Checking MEKANEKO status', 'ステータス確認'],
    chain_status: ['Checking Robinhood Chain', 'チェーン確認'], token_onchain: ['Reading the contract', 'コントラクト確認'], wallet_balances: ['Reading the wallet', 'ウォレット確認'],
    market_trending: ['Trending pools', 'トレンドのプール'], market_new_pools: ['New pools', '新しいプール'], market_token: ['Market data', 'マーケットデータ'],
    market_search: ['Searching tokens', 'トークン検索'], nekopult_tokens: ['Checking Nekopult', 'Nekopult 確認'], nekopult_prepare_launch: ['Preparing launch draft', 'ローンチ下書き'],
    prepare_trade: ['Preparing trade', 'トレード準備'], watchlist: ['Watchlist', 'ウォッチリスト'], ask_agent: ['Asking', '依頼中'],
  };

  const q = new URLSearchParams(location.search);
  let profiles = {}, current = ORDER.includes(q.get('agent')) ? q.get('agent') : 'ryujin', online = false, preview = false, busy = null;
  const img = (id) => `/mekaneko/agents/${id}.webp`;
  const P = (id) => profiles[id.toUpperCase()] || { name: id.toUpperCase() };
  const role = (id) => (lang === 'ja' ? P(id).role_ja : P(id).role_en) || '';
  const store = { get: (id) => { try { return JSON.parse(sessionStorage.getItem('mk-chat-' + id)) || { conv: '', items: [] }; } catch { return { conv: '', items: [] }; } },
    set: (id, v) => { try { sessionStorage.setItem('mk-chat-' + id, JSON.stringify(v)); } catch { /* private mode */ } } };

  function renderList() {
    $('agSub').textContent = t('Fifteen agents, one job each. Ask RYUJIN if you are not sure who to ask.', '15体のエージェント、それぞれにひとつの仕事。迷ったら RYUJIN に。');
    $('agList').innerHTML = ORDER.map((id) => `<li><button class="ag-item" data-id="${id}" style="--accent:${P(id).accent || 'transparent'}"${id === current ? ' aria-current="true"' : ''}>
      <img src="${img(id)}" alt="" width="44" height="44" loading="lazy"><div><b>${esc(P(id).name)}${id === 'ryujin' ? `<i class="tag">${t('START', 'ここから')}</i>` : ''}</b><span>${esc(role(id))}</span></div></button></li>`).join('');
  }
  function renderBar() {
    $('agBar').innerHTML = `<img src="${img(current)}" alt="" width="36" height="36"><div><b>${esc(P(current).name)}</b><br><span>${esc(role(current))}</span></div>${preview ? '<span class="badge badge--demo">PREVIEW · SAMPLE DATA</span>' : ''}<span class="grow"></span>
      <button class="btn" id="agNew" type="button">${t('New chat', '新しいチャット')}</button>`;
    $('agNew').onclick = () => { if (busy) busy.abort(); store.set(current, { conv: '', items: [] }); renderLog(); $('agInput').focus(); };
  }
  function renderProfile() {
    const p = P(current), does = (lang === 'ja' ? p.does_ja : p.does_en) || [], lore = (lang === 'ja' ? p.lore_ja : p.lore_en) || '';
    $('agProfile').innerHTML = `<img src="${img(current)}" alt="${esc(p.name)}" width="272" height="272"><div><h2 class="display">${esc(p.name)}</h2><p>${esc(role(current))}${p.animal_en ? ' · ' + esc(lang === 'ja' ? p.animal_ja : p.animal_en) : ''}</p></div>
      ${lore ? `<div><h3>${t('Story', 'ストーリー')}</h3><p>${esc(lore)}</p></div>` : ''}
      ${does.length ? `<div><h3>${t('What I do', '私の仕事')}</h3><ul>${does.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}
      <div><h3>${t('Live tools', '使えるツール')}</h3><div class="ag-skills">${(TOOLS[current] || []).map((x) => `<span>${esc(x)}</span>`).join('')}</div></div>`;
  }
  function emptyState() {
    const p = P(current), lore = (lang === 'ja' ? p.lore_ja : p.lore_en) || '';
    return `<div class="ag-empty"><div class="ag-empty-head"><img src="${img(current)}" alt="" width="88" height="88"><div><h2 class="display">${esc(p.name)}</h2><p>${esc(role(current))}</p></div></div>
      <p>${esc(lore)}</p><div class="ag-suggest">${(SUGGEST[current] || []).map((s) => `<button class="chip" type="button" data-q="${esc(lang === 'ja' ? s[1] : s[0])}">${esc(lang === 'ja' ? s[1] : s[0])}</button>`).join('')}</div></div>`;
  }

  // ---------------------------------------------------------------- messages
  function cardHTML(c) {
    if (c.kind === 'launch_draft') {
      const d = c.draft;
      return `<div class="card"><h4>${t('Launch draft ready', 'ローンチ下書き完成')}</h4><div class="big">${esc(d.name)} <span class="muted">$${esc(d.ticker)}</span></div>
        <p class="muted">${esc(d.description || '')}</p><div class="row"><a class="btn btn--key" href="${esc(c.url)}">${t('Open in Nekopult', 'Nekopult で開く')}</a></div></div>`;
    }
    if (c.kind === 'verdict' && /^(SAFE|CAUTION|DANGER)$/.test(c.verdict)) {
      const v = c.verdict, mean = { SAFE: t('The Gate passed for a small buy right now.', '少額の購入なら、いま Gate を通過しています。'),
        CAUTION: t('The Gate passed with warnings. Read them before you buy.', '警告つきで Gate を通過。購入前に確認してください。'), DANGER: t('The Gate failed. Do not buy without checking it yourself.', 'Gate 不合格。自分で確かめずに買わないでください。') }[v];
      const wf = c.watchfire === 'fire' || c.watchfire === 'red' ? `<p class="warn">Watchfire: ${esc(c.watchfire_why || c.watchfire)}</p>` : '';
      return `<div class="card card--verdict"><img class="hanko" src="/mekaneko/hanko/${v.toLowerCase()}.webp" alt="SHURU ${v}" width="112" height="112" loading="lazy">
        <div class="vd"><h4>${t('SHURU · Gate check', 'SHURU · Gate チェック')}</h4><div class="big">${v}${c.symbol ? ` · $${esc(c.symbol)}` : ''}</div><p class="muted">${mean}</p>${wf}
        <div class="row"><a class="btn" href="/${MK.lang}/record/?r=${esc(c.receipt)}">${t('Signed receipt', '署名つきレシート')}</a>
        <a class="btn" href="https://robinhoodchain.blockscout.com/token/${esc(c.token)}" target="_blank" rel="noopener">${t('Token', 'トークン')} ↗</a></div>
        <p class="muted small">${c.graded ? t('This verdict is graded in public on The Record in 24 hours.', 'この判定は24時間後に The Record で公開採点されます。') : t('The first verdict on this token today is the one The Record grades.', 'The Record が採点するのは、このトークンへの今日最初の判定です。')}</p></div></div>`;
    }
    if (c.kind === 'trade') {
      return `<div class="card"><h4>${t('Trade preview', 'トレードプレビュー')}</h4><div class="big">${c.side === 'buy' ? t('Buy', '購入') : t('Sell', '売却')} ${esc(c.symbol)}</div>
        <dl><dt>${t('Amount', '数量')}</dt><dd class="mono">${MK.nf(c.amount, 6)} ${esc(c.amount_unit)} (${MK.usd(c.value_usd)})</dd>
        ${c.est_tokens != null ? `<dt>${t('You get about', '受け取り目安')}</dt><dd class="mono">${MK.nf(c.est_tokens, 2)} ${esc(c.symbol)}</dd>` : ''}
        <dt>${t('Price', '価格')}</dt><dd class="mono">${MK.usd(c.price_usd)}</dd><dt>${t('Price impact', '価格影響')}</dt><dd class="mono">${c.price_impact_pct == null ? '—' : MK.nf(c.price_impact_pct, 2) + '%'}</dd>
        <dt>${t('Slippage', 'スリッページ')}</dt><dd class="mono">${c.suggested_slippage_pct}%</dd><dt>${t('Pool', 'プール')}</dt><dd>${esc(c.pair)} · ${esc(c.dex)} · ${MK.usd(c.liquidity_usd)}</dd></dl>
        <div class="row"><button class="btn btn--key" type="button" disabled title="${t('Signing opens when Nekopult goes live', 'Nekopult 公開後に署名できます')}">${t('Sign in wallet (soon)', 'ウォレットで署名（近日）')}</button>
        <a class="btn" href="${esc(c.url)}" target="_blank" rel="noopener">${t('Open pair', 'ペアを開く')} ↗</a></div></div>`;
    }
    return '';
  }
  function msgHTML(m) {
    if (m.role === 'user') return `<div class="msg msg--user"><div class="bubble">${esc(m.text)}</div></div>`;
    const tools = (m.tools || []).map((x) => `<span class="tool ${x.state === 'start' ? '' : x.state}">${esc(x.label)}</span>`).join('');
    return `<div class="msg msg--agent"><img src="${img(m.agent)}" alt="" width="36" height="36">
      ${tools ? `<div class="tools">${tools}</div>` : ''}
      ${m.text ? `<div class="md">${md(m.text)}</div>` : m.pending ? `<div class="thinking">${t('Thinking', '考え中')}</div>` : ''}
      ${(m.cards || []).map(cardHTML).join('')}
      ${m.error ? `<div class="err">${esc(m.error)}</div>` : ''}
      ${m.left != null ? `<div class="meta">${t(`${m.left} of ${m.limit} free questions left today`, `今日の無料質問：残り ${m.left} / ${m.limit} 回`)}</div>` : ''}</div>`;
  }
  function renderLog() {
    const s = store.get(current);
    $('agLog').innerHTML = s.items.length ? s.items.map(msgHTML).join('') : emptyState();
    $('agLog').scrollTop = $('agLog').scrollHeight;
  }

  // the console is closed until the $MEKANEKO holder gate goes live (decided 2026-11-17; ticker MEKANEKO since 2026-11-23 (was MEKA), minimum 100 decided 2026-11-20)
  const SOON = () => t('Coming soon: the agent console opens for holders of 100 $MEKANEKO or more at launch! Nyan~', '近日公開：エージェントコンソールはローンチ時に 100 $MEKANEKO 以上のホルダー向けにオープンします！ニャン〜');

  // ---------------------------------------------------------------- send + stream
  async function send(text) {
    text = text.trim(); if (!text || busy) return;
    if (!online) { toast(SOON()); return; }
    const id = current, s = store.get(id);
    s.items.push({ role: 'user', text });
    const m = { role: 'agent', agent: id, text: '', tools: [], cards: [], pending: true }; s.items.push(m); store.set(id, s);
    renderLog(); setBusy(true);
    const ctrl = new AbortController(); busy = ctrl;
    let raf = 0; const paint = () => { raf = 0; store.set(id, s); if (current === id) { const last = $('agLog').lastElementChild; if (last) last.outerHTML = msgHTML(m); $('agLog').scrollTop = $('agLog').scrollHeight; } };
    const later = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const label = (name, extra) => (TOOL_LABEL[name] ? (lang === 'ja' ? TOOL_LABEL[name][1] : TOOL_LABEL[name][0]) : name) + (extra ? ` ${extra}` : '');
    try {
      const r = await fetch('/api/agents/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ agent: id, conversation: s.conv, message: text, lang }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error === 'offline' || j.error === 'coming_soon' ? SOON() : j.error || r.status); }
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let k; while ((k = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
          const ev = /^event: (.*)$/m.exec(chunk)?.[1], data = JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] || 'null');
          if (ev === 'meta') { s.conv = data.conversation; }
          else if (ev === 'text') { m.pending = false; m.text += data.d; m.tools.forEach((x) => { if (x.state === 'start' && x.server) x.state = 'done'; }); }
          else if (ev === 'tool') {
            if (data.name === 'ask_agent' && !data.label) continue;
            const key = data.name + '|' + (data.label || '');
            let x = m.tools.find((y) => y.key === key && y.state === 'start');
            if (data.state === 'start') { if (!x) m.tools.push({ key, label: label(data.name, data.label), state: 'start', server: /^(web_|code_)/.test(data.name) }); }
            else { x = x || m.tools.slice().reverse().find((y) => y.key.startsWith(data.name + '|') && y.state === 'start'); if (x) x.state = data.state; }
          }
          else if (ev === 'card') m.cards.push(data);
          else if (ev === 'done') { m.cost = data.cost_usd; m.usage = data.usage; m.left = data.left; m.limit = data.limit; m.tools.forEach((x) => { if (x.state === 'start') x.state = 'done'; }); }
          else if (ev === 'error') { m.error = data.message; }
          later();
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') m.error = String(e.message || e); else m.error = t('Stopped.', '停止しました。');
    } finally {
      m.pending = false; m.tools.forEach((x) => { if (x.state === 'start') x.state = 'done'; }); paint(); busy = null; setBusy(false);
    }
  }
  function setBusy(b) {
    $('agSend').textContent = b ? t('Stop', '停止') : t('Send', '送信');
    $('agSend').classList.toggle('btn--key', !b); $('agInput').disabled = false;
  }

  // ---------------------------------------------------------------- wiring
  function select(id) {
    if (busy) busy.abort(); current = id;
    const u = new URL(location.href); u.searchParams.set('agent', id); u.searchParams.delete('q'); history.replaceState(null, '', u);
    renderList(); renderBar(); renderProfile(); renderLog();
    $('agInput').placeholder = t(`Message ${P(id).name}…`, `${P(id).name} にメッセージ…`);
  }
  $('agList').addEventListener('click', (e) => { const b = e.target.closest('.ag-item'); if (b) select(b.dataset.id); });
  $('agLog').addEventListener('click', (e) => { const c = e.target.closest('[data-q]'); if (c) send(c.dataset.q); });
  $('agForm').addEventListener('submit', (e) => { e.preventDefault(); if (busy) { busy.abort(); return; } const v = $('agInput').value; $('agInput').value = ''; grow(); send(v); });
  const grow = () => { const ta = $('agInput'); ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; };
  $('agInput').addEventListener('input', grow);
  $('agInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('agForm').requestSubmit(); } });
  $('agNote').textContent = t('Agents can be wrong. Nothing here is financial advice. Agents never ask for your seed phrase.', 'エージェントは間違えることがあります。投資助言ではありません。シードフレーズを聞くことは絶対にありません。');

  (async () => {
    try { profiles = (await getJSON('/mekaneko/agents-profile.json')).agents || {}; } catch { profiles = {}; }
    try { const st = await getJSON('/api/agents/status'); online = !!st.online; preview = !!st.preview; } catch { online = false; }
    if (preview) { $('agOffline').hidden = false; $('agOffline').textContent = t('Preview: scripted answers with sample data. The live agents are coming soon.', 'プレビュー：サンプルデータによる回答です。本番のエージェントは近日公開。'); }   // local preview server only (dashboard/preview)
    if (!online) { $('agOffline').hidden = false; $('agOffline').textContent = SOON(); }
    setBusy(false); select(current);
    if (q.get('q')) { $('agInput').value = q.get('q'); grow(); $('agInput').focus(); }
  })();
})();
