// Shared helpers for the MEKANEKO app pages: language, header, formatting, toast, safe markdown.
(() => {
  'use strict';
  const lang = location.pathname.startsWith('/ja/') ? 'ja' : 'en';
  document.documentElement.lang = lang;
  const t = (en, ja) => (lang === 'ja' && ja != null ? ja : en);

  const DISCORD = 'https://discord.gg/42sGtf5Xx2';   // the "Mekaneko World" server; config.json › discordUrl wins when set
  function header(active) {
    const el = document.getElementById('mk-head'); if (!el) return;
    const L = (p) => `/${lang}${p}`;
    const nav = [['/about', 'ABOUT MEKANEKO', 'wide'], ['/value', 'OUR VALUE', 'wide'], ['/world/', 'MEKANEKO WORLD', 'wide'], ['/team', 'OUR AGENTS', ''], ['/nekopult/', 'NEKOPULT', '']];
    const other = lang === 'ja' ? 'en' : 'ja', here = location.pathname.replace(/^\/(en|ja)/, '');
    el.className = 'mk-head';
    el.innerHTML = `<a class="mk-logo" href="${L('')}" aria-label="MEKANEKO home"><img src="/elements/logo.png" alt="MEKANEKO" width="132" height="47"></a>
      <span class="grow"></span>
      <nav class="mk-nav" aria-label="Main">${nav.map(([p, n, c]) => `<a class="${c}" href="${L(p)}"${p === active ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>
      <span class="mk-lang"><a href="/ja${here}${location.search}"${lang === 'ja' ? ' aria-current="true"' : ''}>JA</a> / <a href="/en${here}${location.search}"${lang === 'en' ? ' aria-current="true"' : ''}>EN</a></span>
      <a class="mk-buy" href="#" data-k="buy" aria-label="${t('Buy $MEKANEKO', '$MEKANEKO を買う')}">BUY</a>
      <a class="mk-ic mk-ic--dc" href="${DISCORD}" target="_blank" rel="noopener" aria-label="${t('Join our Discord', 'Discord に参加')}"></a>
      <a class="mk-ic mk-ic--tg" href="#" data-k="telegramUrl" aria-label="Telegram"></a>
      <a class="mk-ic mk-ic--x" href="#" data-k="xUrl" aria-label="X"></a>
      <a class="mk-ic mk-ic--gh" href="#" data-k="githubUrl" aria-label="GitHub"></a>
      <a class="mk-ca" href="#" aria-label="${t('Copy the contract address', 'コントラクトアドレスをコピー')}"><span class="mk-ca__copy">COPY </span>CA</a>`;
    void other;
    let cfg = {};
    getJSON('/mekaneko/config.json').then((c) => { cfg = c || {}; if (cfg.discordUrl) el.querySelector('.mk-ic--dc').href = cfg.discordUrl; }).catch(() => {});
    el.querySelectorAll('[data-k]').forEach((a) => a.addEventListener('click', (e) => {      // BUY, Telegram, X, GitHub: from config, or "coming soon"
      e.preventDefault(); const k = a.dataset.k, u = k === 'buy' ? cfg.buyUrl : cfg[k];
      if (u) window.open(u, '_blank', 'noopener'); else toast(k === 'buy' ? t('Buying opens at launch', '購入はローンチ時に開始') : t('Coming soon', '近日公開'));
    }));
    el.querySelector('.mk-ca').addEventListener('click', async (e) => {      // same as the header button on the other pages
      e.preventDefault(); let ca = '';
      try { ca = ((await getJSON('/mekaneko/config.json')).ca || '').trim(); } catch {}
      if (!ca) return toast(t('CA coming soon', 'CA は近日公開'));
      try { await navigator.clipboard.writeText(ca); toast(t('CA copied', 'CA をコピーしました')); } catch { toast(ca); }
    });
  }

  const nf = (v, d = 2) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d }));
  function usd(v) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return '$' + nf(v / 1e9, 2) + 'B'; if (a >= 1e6) return '$' + nf(v / 1e6, 2) + 'M'; if (a >= 1e3) return '$' + nf(v / 1e3, 1) + 'K';
    if (a >= 1) return '$' + nf(v, 2); if (a === 0) return '$0';
    const z = Math.max(2, -Math.floor(Math.log10(a)) + 2); return '$' + Number(v).toFixed(Math.min(z, 10));
  }
  const pct = (v) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${nf(v, 1)}%`);
  const ago = (min) => (min < 60 ? t(`${Math.round(min)}m ago`, `${Math.round(min)}分前`) : min < 1440 ? t(`${Math.round(min / 60)}h ago`, `${Math.round(min / 60)}時間前`) : t(`${Math.round(min / 1440)}d ago`, `${Math.round(min / 1440)}日前`));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

  function toast(msg) {
    const d = document.createElement('div'); d.className = 'mk-toast'; d.setAttribute('role', 'status'); d.textContent = msg; document.body.appendChild(d);
    requestAnimationFrame(() => d.classList.add('on'));
    setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 400); }, 2200);
  }

  // Small, safe markdown: everything is escaped first; only http(s) links are kept.
  function md(src) {
    const blocks = [];
    let s = esc(src).replace(/```[\w-]*\n?([\s\S]*?)(```|$)/g, (_, code) => { blocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
    const inline = (x) => x
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    const out = []; const lines = s.split('\n'); let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\u0000\d+\u0000$/.test(l.trim())) { out.push(blocks[+l.trim().slice(1, -1)]); i++; continue; }
      const h = l.match(/^(#{1,4})\s+(.*)$/); if (h) { out.push(`<h${Math.min(h[1].length + 2, 6)}>${inline(h[2])}</h${Math.min(h[1].length + 2, 6)}>`); i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const row = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
        const head = row(l); i += 2; const body = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
        out.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
        const ordered = /^\s*\d/.test(l); const items = [];
        while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, '')));
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${x}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
      }
      if (!l.trim()) { i++; continue; }
      const para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s|\u0000)/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) para.push(inline(lines[i++]));
      if (!para.length) para.push(inline(lines[i++]));   // a "| … |" row with no separator under it (yet: mid-stream) is plain text; without this, i never moved and the page hung
      out.push(`<p>${para.join('<br>')}</p>`);
    }
    return out.join('');
  }

  async function getJSON(u) { const r = await fetch(u, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(r.status); return r.json(); }

  window.MK = { lang, t, header, nf, usd, pct, ago, esc, short, toast, md, getJSON };
})();
