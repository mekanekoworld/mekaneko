// The Record (season 2): a public report card of each agent's calls, graded 24 hours later, and the Seal that signs each one.
// Everything comes from our own API (/api/record, /api/seal): nothing on this page is typed in by hand.
(() => {
  const { t, esc, nf, usd, pct, getJSON, header, lang } = window.MK;
  header('');
  const $ = (id) => document.getElementById(id);
  const EXP = 'https://robinhoodchain.blockscout.com';
  const IDS = ['ryujin', 'nezu', 'konkon', 'shuru', 'kokeko', 'pyon', 'toramaru', 'kaeru', 'gyudon', 'hayate', 'ukki', 'nishiki', 'chototsu', 'meemee', 'hachi'];
  const HASH = /^0x[0-9a-fA-F]{64}$/;
  let prof = {}, data = null;

  document.title = t('The Record · MEKANEKO', 'The Record · MEKANEKO');
  $('rcLead').innerHTML = t(
    '<b>Every public call our agents make, graded in public.</b> When KOKEKO’s Sentry posts a coin, or SHURU gives a verdict, the price is recorded on the spot and checked again 24 hours later. Each one has a signed receipt in the Seal, chained to the one before it, so changing any of them afterwards would show.',
    '<b>エージェントの公開の判断を、すべて公開で採点します。</b>KOKEKO の Sentry がコインを投稿したとき、SHURU が判定を出したとき、その場で価格を記録し、24時間後にもう一度確かめます。どれにも Seal の署名つきレシートがあり、ひとつ前のレシートとつながっているので、あとから書き換えればわかります。');
  $('rcCardsH').innerHTML = t('Report cards<small>Graded calls only. Nothing here is a forecast or financial advice.</small>', '成績表<small>採点済みの判断だけを数えます。予測でも投資助言でもありません。</small>');
  $('rcCallsH').innerHTML = t('KOKEKO · Sentry calls<small>Coins Sentry posted in Discord after passing the Gate with real buying.</small>', 'KOKEKO · Sentry の投稿<small>Gate を通過し、実際の買いがあったコインとして Sentry が Discord に投稿したもの。</small>');
  $('rcAlertsH').innerHTML = t('KOKEKO · Watchfire alerts<small>Big wallets moving in a coin Sentry posted (watched for 24 hours) or in $MEKANEKO. Patterns, not proof.</small>', 'KOKEKO · Watchfire アラート<small>Sentry が投稿したコイン（24時間）と $MEKANEKO で、大口ウォレットが動いたとき。パターンであり、証拠ではありません。</small>');
  $('rcVerdictsH').innerHTML = t('Gate verdicts<small>The first verdict an agent gave on a token each day.</small>', 'Gate の判定<small>各エージェントがその日に最初に出した判定。</small>');
  $('rcAnswersH').innerHTML = t('Questions answered<small>On the website and with /ask in Discord.</small>', '回答した質問<small>ウェブサイトと Discord の /ask で。</small>');
  $('rcSealH').innerHTML = t('The Seal<small>A signed, hash-chained receipt for every call, verdict and grade.</small>', 'Seal<small>すべての投稿・判定・採点に、署名つきでハッシュチェーンにつながったレシート。</small>');
  $('rcRulesH').textContent = t('How grading works', '採点のしくみ');

  const chip = (kind, words) => `<span class="chip chip--${kind}">${esc(words)}</span>`;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
  const cls = (v) => (v == null ? 'dim' : v > 0 ? 'up' : v < 0 ? 'down' : '');
  const pc = (v) => (v != null && Math.abs(v) < 0.05 ? '<span>0%</span>' : `<span class="${cls(v)}">${pct(v)}</span>`);
  const when = (at) => {
    const m = (Date.now() - at) / 60000;
    const s = m < 60 ? t(`${Math.max(0, Math.round(m))}m ago`, `${Math.max(0, Math.round(m))}分前`) : m < 2880 ? t(`${Math.round(m / 60)}h ago`, `${Math.round(m / 60)}時間前`) : new Date(at).toISOString().slice(0, 10);
    return `<span title="${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC">${s}</span>`;
  };
  const name = (id) => prof[String(id).toUpperCase()]?.name || String(id).toUpperCase();
  const role = (id) => { const p = prof[String(id).toUpperCase()]; return p ? (lang === 'ja' ? p.role_ja : p.role_en) : ''; };
  const accent = (id) => prof[String(id).toUpperCase()]?.accent || '';
  const coin = (c) => `<a href="${EXP}/token/${esc(c.token)}" target="_blank" rel="noopener"><span class="sym">${c.symbol ? '$' + esc(c.symbol) : esc(short(c.token))}</span>${c.symbol ? `<span class="addr">${esc(short(c.token))}</span>` : ''}</a>`;
  const rcpt = (c) => (c.receipts?.length ? `<a href="?r=${esc(c.receipts[0])}">${esc(c.receipts[0].slice(0, 10))}…</a>` : '<span class="dim">—</span>');
  const left = (c) => { const h = Math.max(0, 24 - (Date.now() - c.at) / 3600e3); return h >= 1 ? t(`${Math.round(h)}h to grade`, `採点まで ${Math.round(h)} 時間`) : t('grading soon', 'まもなく採点'); };
  function result(c) {
    if (c.status === 'watching') return chip('wait', left(c));
    if (c.status === 'no-data' || c.status === 'no-price') return chip('wait', t('No price data', '価格データなし'));
    return ({ win: chip('good', t('Win', '勝ち')), miss: chip('bad', t('Miss', '負け')), held: chip('good', t('Held up', '持ちこたえた')), failed: chip('bad', t('Failed', '外れ')),
      collapsed: chip('warn', t('Collapsed', '暴落')), standing: chip('wait', t('Still standing', '下落せず')) })[c.result] || chip('wait', c.result || '—');
  }
  const stamp = (v, s) => (/^(SAFE|CAUTION|DANGER)$/.test(v) ? `<img class="rec-hanko" src="/mekaneko/hanko/${v.toLowerCase()}.webp" alt="SHURU ${v}" width="${s}" height="${s}" loading="lazy">` : '');
  const verdictChip = (v) => stamp(v, 36) + (v === 'SAFE' ? chip('good', 'SAFE') : v === 'CAUTION' ? chip('warn', 'CAUTION') : v === 'DANGER' ? chip('bad', 'DANGER') : chip('wait', '—'));
  const later = (c) => (c.status === 'watching' ? pc(c.changeNow) + ` <span class="dim">${t('now', '現在')}</span>` : pc(c.change24h));
  const rate = (r) => (r == null ? '—' : `${nf(r * 100, 0)}%`);
  const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;

  function cardCalls(id, c) {
    c ||= { calls: 0, watching: 0, graded: 0, wins: 0, winRate: null, median24h: null, medianPeakX: null, reached2x: 0, reachedOf: 0 };
    return `<article class="rec-card" style="--accent:${esc(accent(id))}"><h3>${esc(name(id))}</h3><p class="role">${esc(t('Sentry calls', 'Sentry の投稿'))}</p>
      <p class="rec-big"><b>${rate(c.winRate)}</b><span>${c.graded ? t(`of ${c.graded} graded calls won`, `採点済み ${c.graded} 件のうち勝ち`) : t('no graded calls yet', 'まだ採点済みの投稿はありません')}</span></p>
      <dl class="rec-stats">${stat(t('Calls', '投稿'), nf(c.calls, 0))}${stat(t('Watching now', '追跡中'), nf(c.watching, 0))}${stat(t('Median after 24 h', '24時間後の中央値'), pct(c.median24h))}
      ${stat(t('Median peak', 'ピークの中央値'), c.medianPeakX == null ? '—' : `${nf(c.medianPeakX, 2)}×`)}${stat(t('Reached 2×', '2倍に到達'), c.reachedOf ? `${c.reached2x} / ${c.reachedOf}` : '—')}${stat(t('Wins', '勝ち'), `${c.wins} / ${c.graded}`)}</dl>
      <p class="note">${t('A win: the price 24 hours after the call is above the price at the call.', '勝ち：投稿から24時間後の価格が、投稿時の価格より高いこと。')}</p></article>`;
  }
  function cardVerdicts(id, c) {
    c ||= { verdicts: 0, watching: 0, SAFE: { given: 0, graded: 0, held: 0 }, CAUTION: { given: 0 }, DANGER: { given: 0, graded: 0, collapsed: 0 }, safeHeldRate: null };
    return `<article class="rec-card" style="--accent:${esc(accent(id))}"><h3>${esc(name(id))}</h3><p class="role">${esc(t('Gate verdicts', 'Gate の判定'))}</p>
      <p class="rec-big"><b>${rate(c.safeHeldRate)}</b><span>${c.SAFE.graded ? t(`of ${c.SAFE.graded} graded SAFE verdicts held up`, `採点済みの SAFE ${c.SAFE.graded} 件のうち持ちこたえた`) : t('no graded SAFE verdicts yet', 'まだ採点済みの SAFE はありません')}</span></p>
      <dl class="rec-stats">${stat(t('Verdicts', '判定'), nf(c.verdicts, 0))}${stat(t('Watching now', '追跡中'), nf(c.watching, 0))}${stat('SAFE', nf(c.SAFE.given, 0))}${stat('CAUTION', nf(c.CAUTION.given, 0))}
      ${stat('DANGER', nf(c.DANGER.given, 0))}${stat(t('DANGER that collapsed', '暴落した DANGER'), c.DANGER.graded ? `${c.DANGER.collapsed} / ${c.DANGER.graded}` : '—')}</dl>
      <p class="note">${t('Held up: 24 hours later the coin never lost 80% or more, and a fresh Gate check still passes its buy-and-sell test.', '持ちこたえた：24時間のあいだに80%以上下がらず、改めて Gate を通しても売買テストに合格すること。')}</p></article>`;
  }
  function table(head, rows, empty) {
    if (!rows.length) return `<p class="rec-empty">${empty}</p>`;
    return `<table class="rec-table"><thead><tr>${head.map(([h, n]) => `<th${n ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  function render() {
    const d = data;
    const cards = [cardCalls('kokeko', d.cards.kokeko), cardVerdicts('shuru', d.cards.shuru)];
    for (const [id, c] of Object.entries(d.cards)) if (!['kokeko', 'shuru'].includes(id)) cards.push(c.type === 'calls' ? cardCalls(id, c) : cardVerdicts(id, c));
    $('rcCards').innerHTML = cards.join('');
    $('rcCalls').innerHTML = table([[t('Coin', 'コイン')], [t('Called', '投稿')], [t('Price at call', '投稿時の価格'), 1], ['1 h', 1], [t('24 h', '24時間'), 1], [t('Peak', 'ピーク'), 1], [t('Result', '結果')], [t('Receipt', 'レシート')]],
      d.calls.map((c) => `<tr><td>${coin(c)}</td><td>${c.post ? `<a href="${esc(c.post)}" target="_blank" rel="noopener">${when(c.at)}</a>` : when(c.at)}</td><td class="num">${usd(c.priceAtCall)}</td>
        <td class="num">${pc(c.change1h)}</td><td class="num">${later(c)}</td><td class="num">${c.peakX == null ? '—' : nf(c.peakX, 2) + '×'}</td><td>${result(c)}</td><td>${rcpt(c)}</td></tr>`),
      t('No calls yet. Sentry posts only coins that pass the Gate with real buying (0.5 ETH or more from 25 or more independent wallets), so quiet days happen.', 'まだ投稿はありません。Sentry が投稿するのは、Gate を通過し実際の買い（25以上の独立したウォレットから0.5 ETH以上）があったコインだけなので、静かな日もあります。'));
    const WFK = { whale: ['bad', t('Whale sale', '大口の売り')], gather: ['bad', t('Wallets gathering', 'ウォレット集約')], velocity: ['warn', t('Selling fast', '急速な売り')], weight: ['warn', t('Weight in few hands', '少数に集中')] };
    $('rcAlerts').innerHTML = table([[t('Coin', 'コイン')], [t('When', '日時')], [t('Signal', 'シグナル')], [t('What happened', '内容')], [t('Transaction', 'トランザクション')], [t('Receipt', 'レシート')]],
      (d.alerts || []).map((a) => { const k = WFK[a.kind] || ['wait', a.kind];
        return `<tr><td>${coin({ token: a.token, symbol: a.symbol })}</td><td>${when(a.at)}</td><td>${chip(k[0], k[1])}</td><td style="white-space:normal;min-width:26rem">${esc(a.detail)}</td>
          <td>${a.tx && /^0x[0-9a-fA-F]{64}$/.test(a.tx) ? `<a href="${EXP}/tx/${esc(a.tx)}" target="_blank" rel="noopener">${esc(a.tx.slice(0, 10))}…</a>` : '<span class="dim">—</span>'}</td><td>${rcpt({ receipts: a.receipt ? [a.receipt] : [] })}</td></tr>`; }),
      t('No alerts yet. Watchfire watches every coin KOKEKO posts for 24 hours (and $MEKANEKO after launch) and speaks up when one wallet sells 5% or more of the supply, when wallets gather coins into one wallet, or when holders sell fast.', 'まだアラートはありません。Watchfire は KOKEKO が投稿したコインを24時間（ローンチ後は $MEKANEKO も）見守り、1つのウォレットが供給量の5%以上を売ったとき、複数のウォレットが1つのウォレットにコインを集めたとき、ホルダーが急速に売っているときに知らせます。'));
    $('rcVerdicts').innerHTML = table([[t('Agent', 'エージェント')], [t('Coin', 'コイン')], [t('Verdict', '判定')], [t('Given', '判定日時')], [t('Price then', '判定時の価格'), 1], [t('24 h', '24時間'), 1], [t('Lowest', '最安'), 1], [t('Result', '結果')], [t('Receipt', 'レシート')]],
      d.verdicts.map((c) => `<tr><td>${esc(name(c.agent))}</td><td>${coin(c)}</td><td>${verdictChip(c.verdict)}</td><td>${when(c.at)}</td><td class="num">${usd(c.priceAtCall)}</td>
        <td class="num">${later(c)}</td><td class="num">${pc(c.lowPct)}</td><td>${result(c)}</td><td>${rcpt(c)}</td></tr>`),
      t('No verdicts yet. Ask SHURU “is this token safe?” with a contract address, on the agents page or with /ask in Discord: the verdict lands here.', 'まだ判定はありません。エージェントのページか Discord の /ask で、コントラクトアドレスを添えて SHURU に「このトークンは安全？」と聞くと、判定がここに載ります。'));
    $('rcAnswers').innerHTML = IDS.map((id) => { const a = d.answers[id] || { today: 0, total: 0 };
      return `<div style="--accent:${esc(accent(id))}"><b>${esc(name(id))}</b><span title="${esc(role(id))}">${t(`${nf(a.today, 0)} today · ${nf(a.total, 0)} total`, `今日 ${nf(a.today, 0)} · 累計 ${nf(a.total, 0)}`)}</span></div>`; }).join('');
    $('rcFoot').textContent = t(`Updated ${new Date(d.updatedAt).toISOString().slice(11, 19)} UTC · refreshes every minute · raw data: /api/record`, `${new Date(d.updatedAt).toISOString().slice(11, 19)} UTC に更新 · 1分ごとに更新 · 元データ：/api/record`);
  }

  const KIND = { 'gate-check': t('Gate check', 'Gate チェック'), 'sentry-call': t('Sentry call', 'Sentry の投稿'), 'record-grade': t('Grade', '採点'), watchfire: t('Watchfire alert', 'Watchfire アラート') };
  function checks(c) {
    const mark = (ok, label) => `<li><span>${label}</span><span class="${ok ? 'up' : ok === null ? 'dim' : 'down'}">${ok ? '✓' : ok === null ? '—' : '✗'}</span></li>`;
    return `<ul class="info-links">${mark(c.hash, t('Hash matches the receipt', 'ハッシュが内容と一致'))}${mark(c.ecdsa, t('ECDSA signature by the MEKANEKO signer', 'MEKANEKO 署名者の ECDSA 署名'))}${mark(c.mldsa, t('ML-DSA-65 signature (post-quantum)', 'ML-DSA-65 署名（耐量子）'))}${mark(c.linked, t('Linked to the receipt before it', 'ひとつ前のレシートとつながっている'))}</ul>`;
  }
  async function showReceipt(h) {
    try {
      const { receipt: r, check } = await getJSON(`/api/seal/r/${h}`);
      const owner = data && [...data.calls, ...data.verdicts].find((c) => c.receipts?.includes(r.hash));
      const what = owner ? (owner.kind === 'call' ? t(`${name(owner.agent)}’s Sentry call on ${owner.symbol ? '$' + owner.symbol : short(owner.token)}`, `${name(owner.agent)} の Sentry 投稿：${owner.symbol ? '$' + owner.symbol : short(owner.token)}`)
        : t(`${name(owner.agent)}’s ${owner.verdict} verdict on ${owner.symbol ? '$' + owner.symbol : short(owner.token)}`, `${name(owner.agent)} の判定 ${owner.verdict}：${owner.symbol ? '$' + owner.symbol : short(owner.token)}`)) : '';
      $('rcReceipt').innerHTML = `<section class="info-card">${owner?.verdict ? `<div class="rec-stamp">${stamp(owner.verdict, 120)}</div>` : ''}<h2>${t('Receipt', 'レシート')} #${nf(r.seq, 0)} · ${esc(KIND[r.kind] || r.kind)}</h2>${check.valid ? chip('good', t('Valid', '有効')) : chip('bad', t('Not valid', '無効'))}
        <p>${what ? esc(what) + ' · ' : ''}${esc(new Date(r.at).toISOString().slice(0, 19).replace('T', ' '))} UTC · ${t('subject', '対象')} <a href="${EXP}/token/${esc(r.subject)}" target="_blank" rel="noopener" class="mono">${esc(short(r.subject))}</a>${owner ? ' · ' + result(owner) : ''}</p>
        ${checks(check)}<p class="mono">${esc(r.hash)}</p>
        <details style="grid-column:1/-1"><summary>${t('The receipt (JSON)', 'レシート（JSON）')}</summary><p class="mono">${esc(JSON.stringify(r))}</p></details></section>`;
    } catch (e) {
      $('rcReceipt').innerHTML = `<section class="info-card"><h2>${t('Receipt', 'レシート')}</h2>${chip('bad', t('Not found', '見つかりません'))}<p>${t('No receipt with that hash in the last 30 days.', '過去30日間にそのハッシュのレシートはありません。')}</p></section>`;
    }
  }

  async function sealCard() {
    let s; try { s = await getJSON('/api/seal'); } catch { $('rcSeal').innerHTML = ''; return; }
    const anchor = s.anchor === 'daily' ? (s.lastAnchor ? t(`Daily on Robinhood Chain. Last: ${esc(s.lastAnchor.day)}, <a href="${EXP}/tx/${esc(s.lastAnchor.tx)}" target="_blank" rel="noopener">transaction</a>.`, `毎日 Robinhood Chain に記録。最新：${esc(s.lastAnchor.day)}、<a href="${EXP}/tx/${esc(s.lastAnchor.tx)}" target="_blank" rel="noopener">トランザクション</a>。`) : t('Daily on Robinhood Chain; the first one is on its way.', '毎日 Robinhood Chain に記録します。最初の記録はまもなくです。'))
      : t('Not switched on yet. When it is, the last hash of each day is written to Robinhood Chain, so a closed day can never be rewritten.', 'まだ有効ではありません。有効になると、毎日最後のハッシュを Robinhood Chain に記録し、終わった日は二度と書き換えられなくなります。');
    $('rcSeal').innerHTML = `<section class="info-card"><h2>${t('Receipts', 'レシート')}</h2>${chip(s.seq ? 'good' : 'wait', t(`${nf(s.today, 0)} today`, `今日 ${nf(s.today, 0)}`))}
      <ul class="info-links"><li><span>${t('All receipts', 'すべてのレシート')}</span><span>${nf(s.seq, 0)}</span></li>
      <li><span>${t('Latest hash', '最新のハッシュ')}</span><span class="mono">${s.head ? `<a href="?r=${esc(s.head)}">${esc(s.head)}</a>` : '—'}</span></li>
      <li><span>${t('Signer (ECDSA)', '署名者（ECDSA）')}</span><span class="mono"><a href="${esc(s.keys.ecdsaUrl)}" target="_blank" rel="noopener">${esc(s.keys.ecdsa)}</a></span></li>
      <li><span>${t('Post-quantum key', '耐量子の鍵')}</span><span class="mono">ML-DSA-65 · sha256 ${esc(s.keys.mldsa.sha256.slice(0, 16))}… · <a href="/api/seal">${t('full key', '鍵の全体')}</a></span></li>
      <li><span>${t('On-chain anchor', 'オンチェーン記録')}</span><span>${anchor}</span></li></ul>
      <p>${t('Check one yourself: hash = keccak256 of the receipt’s fields {v, seq, at, kind, subject, ref, digest, prev} as JSON; the ECDSA signature is EIP-191 over “MEKANEKO Seal”, a new line, and the hash. Or paste it below.', '自分で確かめることもできます：hash はレシートの {v, seq, at, kind, subject, ref, digest, prev} を JSON にした keccak256、ECDSA 署名は「MEKANEKO Seal」と改行とハッシュに対する EIP-191 署名です。下に貼り付けても確認できます。')}</p>
      <div class="rec-verify"><textarea id="rcIn" spellcheck="false" placeholder="${esc(t('Paste a receipt (JSON) or a receipt hash', 'レシート（JSON）かレシートのハッシュを貼り付け'))}"></textarea>
      <div class="acts" style="margin:0"><button type="button" id="rcGo">${t('Verify', '確認する')}</button><a href="/api/seal/receipts">${t('Today’s receipts (JSON)', '今日のレシート（JSON）')}</a></div><p class="out" id="rcOut" aria-live="polite"></p></div></section>`;
    $('rcGo').onclick = async () => {
      const v = $('rcIn').value.trim(), out = $('rcOut');
      if (HASH.test(v)) { history.replaceState(null, '', `?r=${v}`); await showReceipt(v); out.textContent = t('Shown at the top of the page.', 'ページの上に表示しました。'); scrollTo({ top: 0, behavior: 'smooth' }); return; }
      let rec; try { rec = JSON.parse(v); } catch { out.textContent = t('That is neither a receipt hash nor receipt JSON.', 'レシートのハッシュでも JSON でもありません。'); return; }
      try {
        const r = await fetch('/api/seal/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receipt: rec }) });
        const { check } = await r.json();
        out.innerHTML = (check.valid ? chip('good', t('Valid', '有効')) : chip('bad', t('Not valid', '無効'))) + checks(check);
      } catch { out.textContent = t('The check did not go through. Try again.', '確認できませんでした。もう一度お試しください。'); }
    };
  }

  $('rcRules').innerHTML = `<section class="info-card"><h2>${t('The rules', 'ルール')}</h2><p>${t(
    'A <b>call</b> is the moment KOKEKO’s Sentry posts a coin. Its price is recorded then (the Pons curve price read on chain while the coin is on the curve, the pool price after), sampled every 5 minutes for a day, and graded 24 hours later: a win when the price is above the price at the call. A <b>verdict</b> is the first SAFE, CAUTION or DANGER an agent gives on a token in a UTC day, from the Gate; later checks the same day get receipts but are not graded again. A SAFE verdict held up when, 24 hours later, the coin never lost 80% or more and a fresh Gate check still passes; CAUTION and DANGER verdicts are shown with what happened, not scored. Calls noted late take their price from GeckoTerminal candles. Nothing is removed: misses stay on the page.',
    '<b>投稿</b>とは、KOKEKO の Sentry がコインを投稿した瞬間です。その時点の価格（カーブ上にあるあいだは Pons カーブの価格をオンチェーンで読み、卒業後はプールの価格）を記録し、1日のあいだ5分ごとに確認して、24時間後に採点します。投稿時より高ければ勝ちです。<b>判定</b>とは、エージェントが Gate をもとに、その UTC 日にそのトークンへ最初に出した SAFE・CAUTION・DANGER です。同じ日の2回目以降のチェックにもレシートは付きますが、採点はしません。SAFE は、24時間のあいだに80%以上下がらず、改めて Gate を通しても合格すれば「持ちこたえた」になります。CAUTION と DANGER は正誤をつけず、その後どうなったかを示します。遅れて記録された投稿の価格は GeckoTerminal のローソク足から取ります。何も消しません。負けもこのページに残ります。')}</p></section>`;

  async function load() {
    try { data = await getJSON('/api/record'); render(); }
    catch { $('rcCards').innerHTML = `<p class="rec-empty">${t('The Record did not answer just now. Try again in a minute.', 'The Record が応答しませんでした。1分後にもう一度お試しください。')}</p>`; }
  }
  (async () => {
    try { prof = (await getJSON('/mekaneko/agents-profile.json')).agents || {}; } catch {}
    await load();
    const h = new URLSearchParams(location.search).get('r');
    if (h && HASH.test(h)) showReceipt(h);
    sealCard();
    setInterval(load, 60_000);
  })();
})();
