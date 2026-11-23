// Verify page: everything a buyer or a project checker can verify without trusting us. Filled from /mekaneko/config.json
// (the same file as the COPY CA button); a piece that does not exist yet says when it arrives instead of showing a placeholder.
(() => {
  const { t, esc, getJSON, header, toast } = window.MK;
  header('');
  const $ = (id) => document.getElementById(id);
  document.title = t('Verify · MEKANEKO', '検証 · MEKANEKO');
  $('vfTitle').textContent = t('Verify', '検証');
  $('vfLead').innerHTML = t('Check MEKANEKO yourself. Every item links to a public source, so you never have to take our word for it. <b>If an address or link is not on this page, it is not ours.</b>',
    'MEKANEKO をご自身で確認してください。すべての項目が公開された情報源につながっているので、私たちの言葉を信じる必要はありません。<b>このページにないアドレスやリンクは、私たちのものではありません。</b>');

  const chip = (kind, words) => `<span class="chip chip--${kind}">${esc(words)}</span>`;
  const card = (name, state, text, acts = '') => `<section class="info-card"><h2>${esc(name)}</h2>${state}<p>${text}</p>${acts ? `<div class="acts">${acts}</div>` : ''}</section>`;
  const ext = (href, words) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(words)}</a>`;

  getJSON('/mekaneko/config.json').catch(() => ({})).then((c) => {
    const ca = /^0x[0-9a-fA-F]{40}$/.test(c.ca || '') ? c.ca : '';
    const soon = t('Coming soon', '近日公開');
    const out = [];
    out.push(card(t('$MEKANEKO contract', '$MEKANEKO コントラクト'), ca ? chip('good', t('Live', 'ライブ')) : chip('wait', t('At launch', 'ローンチ時')),
      ca ? t(`<span class="mono">${esc(ca)}</span><br>Robinhood Chain. Match it with the pinned post on X and the pinned message in Discord and Telegram.`,
             `<span class="mono">${esc(ca)}</span><br>Robinhood Chain。X の固定ポスト、Discord と Telegram の固定メッセージと一致するか確認してください。`)
         : t('The one official address appears here, on X, in Discord and in Telegram at the same moment. <b>Any address you see before that is fake.</b>',
             '公式アドレスは、ここと X、Discord、Telegram に同時に表示されます。<b>それより前に出回るアドレスはすべて偽物です。</b>'),
      ca ? `<button type="button" id="vfCopy">${t('Copy address', 'アドレスをコピー')}</button>${ext(`https://robinhoodchain.blockscout.com/token/${ca}`, 'Blockscout')}` : ''));
    out.push(card(t('Launch rules: Pons', 'ローンチのルール：Pons'), chip('good', t('Public rules', '公開ルール')),
      t('$MEKANEKO is a fair launch on Pons, the bonding-curve launchpad on Robinhood Chain. Pons mints the whole fixed supply of 1,000,000,000 into the curve: no presale, no team allocation, no mint after launch. At graduation the liquidity is locked permanently.',
        '$MEKANEKO は Robinhood Chain のボンディングカーブ型ローンチパッド Pons でフェアローンチします。Pons は固定供給量 1,000,000,000 のすべてをカーブに発行します。プレセールもチーム配分も、ローンチ後の追加発行もありません。卒業時の流動性は永久にロックされます。'),
      ext('https://docs.ponsfamily.com/docs/v2', t('Pons v2 docs', 'Pons v2 ドキュメント'))));
    out.push(card(t('Team wallets', 'チームのウォレット'), chip('wait', t('Before launch', 'ローンチ前')),
      t('Every wallet the team buys from is listed here before launch, so anyone can follow it on Blockscout. Team members buy on the curve like everyone else.',
        'チームが購入に使うウォレットは、ローンチ前にすべてここで公開します。誰でも Blockscout で追跡できます。チームもほかの人と同じくカーブで購入します。')));
    out.push(card(t('Source code', 'ソースコード'), c.githubUrl ? chip('good', 'GitHub') : chip('wait', soon),
      c.githubUrl ? t('The code behind the agents and the dashboard, public on GitHub.', 'エージェントとダッシュボードのコードを GitHub で公開しています。')
        : t('A public GitHub repository with the code behind the agents and the dashboard.', 'エージェントとダッシュボードのコードを公開する GitHub リポジトリ。'),
      c.githubUrl ? ext(c.githubUrl, 'GitHub') : ''));
    out.push(card(t('Nekopult contracts and audit', 'Nekopult のコントラクトと監査'), chip('wait', t('After audit', '監査後')),
      t('Not deployed yet. The contracts go to Robinhood Chain testnet first, then to an independent audit. The report is published here before Nekopult opens to creators.',
        'まだデプロイされていません。コントラクトはまず Robinhood Chain のテストネットへ、その後独立した監査を受けます。Nekopult がクリエイターに開放される前に、監査レポートをここで公開します。')));
    const rows = [[t('Website', 'ウェブサイト'), c.worldUrl], [t('Dashboard', 'ダッシュボード'), location.origin], ['X', c.xUrl], ['Discord', c.discordUrl],
      ['Telegram', c.telegramUrl], ['GitHub', c.githubUrl]];
    out.push(card(t('Official links', '公式リンク'), chip('good', t('Current', '最新')),
      t('The only official places. The team and the agents never DM first and never ask for a seed phrase or a private key.',
        '公式の場所はこれだけです。チームとエージェントから先に DM することはなく、シードフレーズや秘密鍵を聞くこともありません。')
      + `</p><ul class="info-links">${rows.map(([k, v]) => `<li><span>${esc(k)}</span><span>${v ? ext(v, v.replace(/^https?:\/\//, '')) : esc(soon)}</span></li>`).join('')}</ul><p hidden>`));
    $('vfList').innerHTML = out.join('');
    $('vfFoot').textContent = t('Nothing on this page is financial advice.', 'このページの内容は金融アドバイスではありません。');
    const btn = $('vfCopy');
    if (btn) btn.onclick = async () => { try { await navigator.clipboard.writeText(ca); toast(t('Address copied', 'アドレスをコピーしました')); } catch { toast(ca); } };
  });
})();
