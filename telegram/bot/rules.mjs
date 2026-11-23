// SHURU's message filter for the Telegram group: what to remove, and why. Pure functions, no Telegram calls (test_rules.mjs).
// Telegram has no AutoMod, so this does what Discord's AutoMod rules do there, with the same word list and the same allowed hosts
// (vendor/automod.json, from discord/layout.mjs).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const vendor = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`./vendor/${f}`, import.meta.url)), 'utf8'));
export const AUTOMOD = vendor('automod.json');
export const LINKS = vendor('links.json');

// Discord AutoMod keyword syntax: "word" = whole word, "*word*" / "word*" = substring. CJK words are always substrings.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function keywordRegex(words) {
  const parts = words.map((w) => {
    const pre = w.startsWith('*'), post = w.endsWith('*'), core = esc(w.replace(/^\*|\*$/g, '').toLowerCase());
    if (!/^[\x00-\x7f]+$/.test(core)) return core;
    return `${pre ? '' : '(?<![a-z0-9])'}${core.replace(/\\? /g, '\\s+')}${post ? '' : '(?![a-z0-9])'}`;
  });
  return new RegExp(parts.join('|'), 'i');
}
const SCAM = keywordRegex(AUTOMOD.scamWords);

const TG_HOSTS = new Set(['t.me', 'telegram.me', 'telegram.dog']);
const RISKY_FILE = /\.(apk|exe|scr|bat|cmd|com|msi|js|jse|vbs|ps1|jar|zip|rar|7z|html?|svg|lnk|dmg|pkg|iso)$/i;
const pathOf = (u) => u.pathname.replace(/\/+$/, '');          // invite codes are case-sensitive: compare as written
const own = (url) => { try { return new URL(url); } catch { return null; } };
const OWN_TG = own(LINKS.telegramUrl), OWN_DC = own(LINKS.discordUrl);

// every link in a message: url entities, hidden text_link targets, and url buttons (messages sent "via" an inline bot)
export function urlsOf(msg) {
  const text = msg.text ?? msg.caption ?? '', ents = msg.entities ?? msg.caption_entities ?? [], out = [];
  for (const e of ents) {
    if (e.type === 'url') out.push(text.slice(e.offset, e.offset + e.length));
    else if (e.type === 'text_link' && e.url) out.push(e.url);
  }
  for (const row of msg.reply_markup?.inline_keyboard ?? []) for (const b of row) if (b.url) out.push(b.url);
  return out;
}

export function parseUrl(raw) {
  const s = raw.trim(), u = own(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  return u && /^https?:$/.test(u.protocol) ? u : (u && u.protocol === 'tg:' ? u : null);
}

// one link: null when allowed, otherwise the reason. Exact host match, so x.com.evil.site is still outside the list.
export function linkVerdict(raw) {
  const u = parseUrl(raw);
  if (!u) return 'link';
  if (u.protocol === 'tg:') return 'invite';                                   // tg://join?invite=… and friends
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (TG_HOSTS.has(host)) return OWN_TG && pathOf(u) === pathOf(OWN_TG) ? null : 'invite';
  if (host === 'discord.gg' || ((host === 'discord.com' || host === 'discordapp.com') && /^\/invite\//i.test(u.pathname)))
    return OWN_DC && pathOf(u).split('/').pop() === pathOf(OWN_DC).split('/').pop() ? null : 'invite';
  return AUTOMOD.allowedHosts.includes(host) ? null : 'link';
}

// a whole message from a member (never an admin): { kind, detail } to remove it, or null.
//   level: the sender's MEKANEKO level. 20+ may post outside links (as on Discord); 3+ may forward posts from channels.
export function inspect(msg, level = 0) {
  const text = msg.text ?? msg.caption ?? '';
  const scam = text.normalize('NFKC').match(SCAM);
  if (scam) return { kind: 'scam', detail: scam[0] };
  for (const raw of urlsOf(msg)) {
    const v = linkVerdict(raw);
    if (v === 'invite') return { kind: 'invite', detail: raw };
    if (v === 'link' && level < 20) return { kind: 'link', detail: raw };
  }
  const doc = msg.document?.file_name;
  if (doc && RISKY_FILE.test(doc)) return { kind: 'file', detail: doc };
  if (level < 3 && msg.forward_origin && ['channel', 'chat'].includes(msg.forward_origin.type)) return { kind: 'forward', detail: msg.forward_origin.chat?.title || '' };
  return null;
}

// the @usernames a message mentions (SHURU looks them up: a public channel or group that isn't ours counts as an invite)
export function mentionsOf(msg) {
  const text = msg.text ?? msg.caption ?? '', ents = msg.entities ?? msg.caption_entities ?? [];
  return ents.filter((e) => e.type === 'mention').map((e) => text.slice(e.offset, e.offset + e.length));
}

export const REASON = {
  scam: ['scam words (seed phrase, wallet "sync", airdrop claims, DM offers)', '詐欺に使われる言葉（シードフレーズ、ウォレット同期、エアドロップ請求、DM勧誘）'],
  link: ['a link outside the official list', '公式リスト外のリンク'],
  invite: ['an invite to another group or server', '他のグループやサーバーへの招待'],
  file: ['a file type that can carry malware', 'マルウェアの危険があるファイル形式'],
  forward: ['a forwarded post (unlocks at level 3)', '転送投稿（レベル3で解放）'],
};
