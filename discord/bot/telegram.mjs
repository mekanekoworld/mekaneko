// Posting into the MEKANEKO Telegram channel from the Discord agents: KOKEKO's /x and /announce on Discord reach both places.
// Uses the Telegram KOKEKO bot (TELEGRAM_TOKEN_KOKEKO) and the channel id (TELEGRAM_CHANNEL_ID); without them it stays off.
// It only sends. The Telegram service (telegram/bot) owns the bot's updates, so the two never fight over getUpdates.
const env = (k) => process.env[k] || '';
export const tgReady = () => !!(env('TELEGRAM_TOKEN_KOKEKO') && env('TELEGRAM_CHANNEL_ID'));

async function call(method, body) {
  const r = await fetch(`${env('TG_API_ROOT') || 'https://api.telegram.org'}/bot${env('TELEGRAM_TOKEN_KOKEKO')}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ chat_id: env('TELEGRAM_CHANNEL_ID'), ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `HTTP ${r.status}`);
  return j.result;
}

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Discord markdown -> Telegram HTML. Discord-only bits (mentions, custom emoji) are dropped; timestamps become a UTC date.
export function toTgHtml(s) {
  const stamp = (n) => new Date(Number(n) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  let t = String(s ?? '').replace(/<t:(\d+)(?::\w)?>/g, (_, n) => stamp(n)).replace(/<a?:(\w+):\d+>/g, '').replace(/<[@#][!&]?\d+>/g, '');
  const links = []; t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, txt, url) => `\u0000${links.push([txt, url]) - 1}\u0000`);
  t = esc(t)
    .replace(/^#{1,3} (.+)$/gm, '<b>$1</b>')
    .replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>').replace(/__(.+?)__/gs, '<u>$1</u>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~(.+?)~~/gs, '<s>$1</s>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<a href="${esc(links[i][1]).replace(/"/g, '&quot;')}">${esc(links[i][0])}</a>`).trim();
}

// one post in the channel. With an image: a photo with the text as caption (Telegram allows 1,024 characters there),
// otherwise the text first and the photo right after it. pin = pin it in the channel (and notify).
export async function tgPost(html, { image, pin = false, preview = false } = {}) {
  let m;
  if (image && html.length <= 1024) m = await call('sendPhoto', { photo: image, caption: html, parse_mode: 'HTML' });
  else {
    m = await call('sendMessage', { text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: !preview } });
    if (image) await call('sendPhoto', { photo: image }).catch(() => {});
  }
  if (pin) await call('pinChatMessage', { message_id: m.message_id, disable_notification: false }).catch(() => {});
  return m;
}
