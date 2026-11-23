// Status page (GYUDON): checks the live pieces from the visitor's browser every 30 s. Nothing here is cached or made up:
// each card is one request to our own API (agents, chain, market data) or one line of config (token, Nekopult).
(() => {
  const { t, esc, nf, getJSON, header, lang } = window.MK;
  header('');
  const $ = (id) => document.getElementById(id);
  document.title = t('Status · MEKANEKO', 'ステータス · MEKANEKO');
  $('stTitle').textContent = t('Status', 'ステータス');
  $('stLead').innerHTML = t('🐮 <b>GYUDON keeps watch.</b> Every piece of MEKANEKO, checked live from your browser. Moo.',
    '🐮 <b>GYUDON が見張っています。</b>MEKANEKO のすべてを、あなたのブラウザからリアルタイムで確認します。モー。');

  const chip = (kind, words) => `<span class="chip chip--${kind}">${esc(words)}</span>`;
  const card = (name, state, text) => `<section class="info-card"><h2>${esc(name)}</h2>${state}<p>${text}</p></section>`;
  async function timed(url) {
    const t0 = performance.now(); const v = await getJSON(url); return [v, Math.round(performance.now() - t0)];
  }
  const ms = (n) => `${nf(n, 0)} ms`;

  async function check() {
    const cards = [];
    cards.push(card(t('Website and dashboard', 'ウェブサイトとダッシュボード'), chip('good', t('Up', '稼働中')),
      t('You are reading this page, so the dashboard is up. MEKANEKO WORLD (the 3D site) is served the same way.', 'このページが表示されているので、ダッシュボードは稼働中です。MEKANEKO WORLD（3Dサイト）も同じ仕組みで配信されています。')));
    try {
      const [s, d] = await timed('/api/agents/status');
      const state = !s.online ? chip('bad', t('Offline', 'オフライン')) : s.resting ? chip('warn', t('Resting', '休憩中')) : chip('good', t('Online', 'オンライン'));
      const words = !s.online ? t('The agents are not answering right now. Try again later.', 'エージェントは現在応答していません。しばらくしてからお試しください。')
        : s.resting ? t('The agents used today’s budget and are back at 00:00 UTC.', 'エージェントは今日の予算を使い切りました。00:00 UTC に戻ります。')
        : t(`Fifteen agents answer on the website and with /ask in Discord. You have ${s.left} of ${s.limit} free questions left today. Response ${ms(d)}.`,
            `15体のエージェントがウェブと Discord の /ask で回答中。今日の無料質問は残り ${s.left} / ${s.limit} 回。応答 ${ms(d)}。`);
      cards.push(card(t('AI agents', 'AIエージェント'), state, words));
    } catch { cards.push(card(t('AI agents', 'AIエージェント'), chip('bad', t('Unreachable', '接続できません')), t('The agent server did not answer.', 'エージェントのサーバーが応答しませんでした。'))); }
    try {
      const [c, d] = await timed('/api/chain/status');
      const ok = c.block_age_s != null && c.block_age_s < 60;
      cards.push(card('Robinhood Chain', chip(ok ? 'good' : 'warn', ok ? t('Healthy', '正常') : t('Slow', '遅延')),
        t(`Block <b class="mono">${nf(c.latest_block, 0)}</b>, ${nf(c.block_age_s, 0)} s ago. Gas ${nf(c.gas_price_gwei, 4)} gwei. Chain ID ${c.chain_id}. RPC ${ms(d)}.`,
          `ブロック <b class="mono">${nf(c.latest_block, 0)}</b>（${nf(c.block_age_s, 0)} 秒前）。ガス ${nf(c.gas_price_gwei, 4)} gwei。チェーンID ${c.chain_id}。RPC ${ms(d)}。`)));
    } catch { cards.push(card('Robinhood Chain', chip('bad', t('Unreachable', '接続できません')), t('The chain RPC did not answer.', 'チェーンの RPC が応答しませんでした。'))); }
    try {
      const [m, d] = await timed('/api/market/trending');
      const n = Array.isArray(m) ? m.length : (m.pools || m.items || []).length;
      cards.push(card(t('Market data', 'マーケットデータ'), chip(n ? 'good' : 'warn', n ? t('Live', 'ライブ') : t('Empty', '空')),
        t(`GeckoTerminal answered with ${n} Robinhood Chain pools in ${ms(d)}. The agents use the same feed.`, `GeckoTerminal が ${ms(d)} で Robinhood Chain のプール ${n} 件を返しました。エージェントも同じデータを使います。`)));
    } catch { cards.push(card(t('Market data', 'マーケットデータ'), chip('bad', t('Unreachable', '接続できません')), t('GeckoTerminal did not answer.', 'GeckoTerminal が応答しませんでした。'))); }
    let cfg = {}; try { cfg = await getJSON('/mekaneko/config.json'); } catch {}
    const ca = /^0x[0-9a-fA-F]{40}$/.test(cfg.ca || '');
    cards.push(card('$MEKANEKO', ca ? chip('good', t('Live', 'ライブ')) : chip('wait', t('Not live yet', '未発行')),
      ca ? t(`Contract <span class="mono">${esc(cfg.ca)}</span>. Check it on the <a href="/${lang}/verify/">verify page</a>.`, `コントラクト <span class="mono">${esc(cfg.ca)}</span>。<a href="/${lang}/verify/">検証ページ</a>で確認できます。`)
        : t('Launches on Pons. Any contract address you see before it appears on the verify page is fake.', 'Pons でローンチします。検証ページに表示される前に出回るアドレスはすべて偽物です。')));
    cards.push(card('Nekopult', cfg.nekopultLive ? chip('good', t('Live', 'ライブ')) : chip('wait', t('Not live yet', '未稼働')),
      cfg.nekopultLive ? t('The launchpad contracts are live.', 'ローンチパッドのコントラクトは稼働中です。')
        : t('The interface shows sample data. The contracts open after an independent audit.', '画面はサンプルデータです。コントラクトは独立した監査の後に公開されます。')));
    $('stList').innerHTML = cards.join('');
    $('stFoot').textContent = t(`Checked ${new Date().toISOString().slice(11, 19)} UTC · refreshes every 30 seconds`, `${new Date().toISOString().slice(11, 19)} UTC に確認 · 30秒ごとに更新`);
  }
  check(); setInterval(check, 30_000);
})();
