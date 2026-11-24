// End-to-end test of the six Telegram agents against a fake Bot API (no real Telegram, no network): node test_bots.mjs
// Starts index.mjs with test tokens, feeds it updates the way Telegram would, and checks the calls the bots make.
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAMES = ['SHURU', 'HACHI', 'PYON', 'KOKEKO', 'MEEMEE', 'RYUJIN'];
const BOT = Object.fromEntries(NAMES.map((n, i) => [n, { id: 1001 + i, token: `${1001 + i}:TEST${n}` }]));
const byToken = Object.fromEntries(NAMES.map((n) => [BOT[n].token, n]));
const G = { id: -1001, type: 'supergroup', title: 'MEKANEKO World' }, CHANNEL = { id: -100555, type: 'channel', title: 'MEKANEKO' };
const OWNER = { id: 1, is_bot: false, first_name: 'Owner', language_code: 'en' };
const user = (id, first_name, extra = {}) => ({ id, is_bot: false, first_name, language_code: 'en', ...extra });

// ---------- fake Bot API ----------
const calls = [], queues = Object.fromEntries(NAMES.map((n) => [n, []])), polling = new Set();
let mid = 5000, uid = 1;
const server = http.createServer((req, res) => {
  let raw = ''; req.on('data', (d) => (raw += d)); req.on('end', async () => {
    const [, token, method] = req.url.match(/^\/bot([^/]+)\/(\w+)/) || [];
    const who = byToken[token], body = raw ? JSON.parse(raw) : {};
    const send = (result) => res.end(JSON.stringify({ ok: true, result }));
    const fail = (code, description) => { res.statusCode = code; res.end(JSON.stringify({ ok: false, error_code: code, description })); };
    if (!who) return fail(401, 'Unauthorized');
    if (method === 'getUpdates') {
      polling.add(who);
      for (let i = 0; i < 6 && !queues[who].length; i++) await new Promise((r) => setTimeout(r, 25));
      return send(queues[who].splice(0));
    }
    calls.push({ bot: who, method, body, t: Date.now() });
    if (method === 'getMe') return send({ id: BOT[who].id, is_bot: true, first_name: who, username: `Mekaneko${who}Bot`, can_join_groups: true });
    if (method === 'getChatAdministrators') return send([{ status: 'creator', user: OWNER }, ...NAMES.map((n) => ({ status: 'administrator', user: { id: BOT[n].id, is_bot: true, first_name: n } }))]);
    if (method === 'getChat') return body.chat_id === '@scamchannel' ? send({ id: -100777, type: 'channel', title: 'Pump signals' }) : fail(400, 'Bad Request: chat not found');
    if (['sendMessage', 'sendPhoto', 'editMessageText'].includes(method))
      return send({ message_id: body.message_id || ++mid, date: 0, chat: { id: body.chat_id, type: body.chat_id > 0 ? 'private' : 'supergroup' }, text: body.text });
    return send(true);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

let up = 0;
const push = (update, to = NAMES) => { for (const n of to) queues[n].push({ update_id: ++up, ...structuredClone(update) }); };
const msg = (from, text, extra = {}, chat = G) => {
  const m = { message_id: ++mid, date: Math.floor(Date.now() / 1000), chat, from, ...(text != null ? { text } : {}), ...extra };
  if (text?.startsWith('/')) m.entities = [{ type: 'bot_command', offset: 0, length: text.split(/\s/)[0].length }, ...(extra.entities || [])];
  push({ message: m }); return m;
};
const join = (u) => push({ chat_member: { chat: G, from: u, date: 0, old_chat_member: { status: 'left', user: u }, new_chat_member: { status: 'member', user: u } } });
const tap = (u, data, message_id) => push({ callback_query: { id: String(++uid), from: u, chat_instance: 'x', data, message: { message_id, date: 0, chat: G } } });
const react = (u, message_id, emoji) => push({ message_reaction: { chat: G, message_id, user: u, date: 0, old_reaction: [], new_reaction: [{ type: 'emoji', emoji }] } });

const since = () => calls.length;
async function waitFor(desc, pred, from = 0, ms = 4000) {
  const end = Date.now() + ms;
  for (;;) { const c = calls.slice(from).find(pred); if (c) return c; if (Date.now() > end) throw new Error(`timed out waiting for: ${desc}`); await new Promise((r) => setTimeout(r, 25)); }
}
const none = async (desc, pred, from, ms = 600) => { await new Promise((r) => setTimeout(r, ms)); assert.ok(!calls.slice(from).some(pred), `should not happen: ${desc}`); };
const sent = (bot, re, chat = G.id) => (c) => c.bot === bot && ['sendMessage', 'sendPhoto'].includes(c.method) && c.body.chat_id === chat && re.test(c.body.text || c.body.caption || '');
let n = 0; const step = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

// ---------- start the agents ----------
const data = mkdtempSync(pjoin(tmpdir(), 'mk-tg-'));
const env = { ...process.env, TG_API_ROOT: `http://127.0.0.1:${port}`, TELEGRAM_CHAT_ID: String(G.id), TELEGRAM_CHANNEL_ID: String(CHANNEL.id), MK_DATA: data, MK_TG_FAST: '1',
  ...Object.fromEntries(NAMES.map((n) => [`TELEGRAM_TOKEN_${n}`, BOT[n].token])) };
const child = spawn(process.execPath, [fileURLToPath(new URL('./index.mjs', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
const fail = (e) => { console.error('\n✖', e.message, '\n--- agent log ---\n' + out.split('\n').slice(-30).join('\n')); child.kill('SIGKILL'); server.close(); process.exit(1); };

try {
  await step('all six bots start, poll, and set their command menus', async () => {
    const end = Date.now() + 8000; while (polling.size < 6 && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    assert.equal(polling.size, 6, `polling: ${[...polling]}`);
    assert.ok(calls.filter((c) => c.method === 'setMyCommands').length >= 36);
  });

  const alice = user(100, 'Alice'), bob = user(101, 'Bob'), carol = user(103, 'Carol'), dave = user(104, 'Dave');
  await step('captcha: a new member is muted, taps the right emoji, is let in and welcomed by HACHI', async () => {
    const s = since(); join(alice);
    await waitFor('mute Alice', (c) => c.bot === 'SHURU' && c.method === 'restrictChatMember' && c.body.user_id === 100 && c.body.permissions.can_send_messages === false, s);
    const cap = await waitFor('captcha message', (c) => sent('SHURU', /Tap the/)(c) && c.body.reply_markup, s);
    const target = cap.body.text.match(/<b>(\S+) /)[1], btn = cap.body.reply_markup.inline_keyboard.flat().find((b) => b.text === target);
    const capId = calls.slice(s).filter((c) => c.method === 'sendMessage').length && mid;   // id the fake API gave it
    tap(alice, btn.callback_data, capId);
    await waitFor('unmute Alice', (c) => c.method === 'restrictChatMember' && c.body.user_id === 100 && c.body.permissions.can_send_messages === true, s);
    await waitFor('HACHI welcome', sent('HACHI', /Welcome to MEKANEKO World.*tg:\/\/user\?id=100/s), s);
  });
  await step('captcha: no answer in time = removed (ban + unban, may rejoin)', async () => {
    const s = since(); join(bob);
    await waitFor('ban Bob', (c) => c.method === 'banChatMember' && c.body.user_id === 101, s, 5000);
    await waitFor('unban Bob', (c) => c.method === 'unbanChatMember' && c.body.user_id === 101 && c.body.only_if_banned, s);
  });
  await step('captcha: two wrong taps = removed', async () => {
    const s = since(); join(carol);
    const cap = await waitFor('captcha for Carol', (c) => sent('SHURU', /id=103/)(c) && c.body.reply_markup, s);
    const target = cap.body.text.match(/<b>(\S+) /)[1], wrong = cap.body.reply_markup.inline_keyboard.flat().find((b) => b.text !== target);
    tap(carol, wrong.callback_data, 1); await new Promise((r) => setTimeout(r, 150)); tap(carol, wrong.callback_data, 1);
    await waitFor('ban Carol', (c) => c.method === 'banChatMember' && c.body.user_id === 103, s);
  });
  await step('look-alike name: "MEKANEKO Support" is held until the name changes', async () => {
    const s = since(); join(user(102, 'MEKANEKO Support'));
    await waitFor('hold notice', sent('SHURU', /looks like MEKANEKO staff/), s);
    await waitFor('muted', (c) => c.method === 'restrictChatMember' && c.body.user_id === 102 && c.body.permissions.can_send_messages === false, s);
  });
  await step('filter: outside link, hidden link and a foreign channel are removed; 3 in an hour = 1 h mute', async () => {
    let s = since(); const m1 = msg(alice, 'claim here https://evil.example/claim', { entities: [{ type: 'url', offset: 11, length: 26 }] });
    await waitFor('delete m1', (c) => c.bot === 'SHURU' && c.method === 'deleteMessage' && c.body.message_id === m1.message_id, s);
    await waitFor('notice', sent('SHURU', /outside the official list/), s);
    const m2 = msg(alice, 'official site', { entities: [{ type: 'text_link', offset: 0, length: 13, url: 'https://evil.example' }] });
    await waitFor('delete m2', (c) => c.method === 'deleteMessage' && c.body.message_id === m2.message_id, s);
    s = since(); const m3 = msg(alice, 'join @scamchannel', { entities: [{ type: 'mention', offset: 5, length: 12 }] });
    await waitFor('delete m3', (c) => c.method === 'deleteMessage' && c.body.message_id === m3.message_id, s);
    await waitFor('mute 1 h', (c) => c.method === 'restrictChatMember' && c.body.user_id === 100 && c.body.until_date > 0, s);
  });
  await step('filter: official links, our invite and admins are left alone; scam words are removed', async () => {
    const s = since();
    const ok1 = msg(dave, 'see https://mekaneko.com and t.me/mekanekoworld', { entities: [{ type: 'url', offset: 4, length: 20 }, { type: 'url', offset: 29, length: 22 }] });
    const ok2 = msg(OWNER, 'partner https://partner.example', { entities: [{ type: 'url', offset: 8, length: 23 }] });
    await none('delete official/admin', (c) => c.method === 'deleteMessage' && [ok1.message_id, ok2.message_id].includes(c.body.message_id), s);
    const bad = msg(dave, 'admin here, send me your seed phrase');
    await waitFor('delete scam', (c) => c.method === 'deleteMessage' && c.body.message_id === bad.message_id, s);
  });
  await step('PYON: GM gets a 🔥 reaction, /rank and /leaderboard answer', async () => {
    const s = since(); const gm = msg(dave, 'gm everyone, have a great day');
    await waitFor('GM reaction', (c) => c.bot === 'PYON' && c.method === 'setMessageReaction' && c.body.message_id === gm.message_id, s);
    msg(dave, '/rank'); await waitFor('rank', sent('PYON', /Dave<\/b> · Level \d+/), s);
    msg(dave, '/leaderboard'); await waitFor('leaderboard', sent('PYON', /leaderboard/), s);
  });
  await step('HACHI: /faq menu, a topic button, /links and /rules', async () => {
    const s = since(); msg(dave, '/faq');
    const menu = await waitFor('faq menu', (c) => sent('HACHI', /know/)(c) && c.body.reply_markup, s);
    assert.ok(menu.body.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === 'faq:token:en'));
    tap(dave, 'faq:token:en', 7777);
    await waitFor('faq answer', (c) => c.bot === 'HACHI' && c.method === 'editMessageText' && /\$MEKANEKO is not live yet/.test(c.body.text) && /\/links/.test(c.body.text), s);
    msg(dave, '/links'); await waitFor('links', sent('HACHI', /t\.me\/mekanekoworld[\s\S]*not live yet/), s);
    msg(dave, '/rules'); await waitFor('rules', sent('HACHI', /group rules[\s\S]*グループのルール/), s);
  });
  await step('MEEMEE /omikuji and RYUJIN /agents, /ask', async () => {
    const s = since(); msg(dave, '/omikuji'); await waitFor('omikuji', sent('MEEMEE', /🎋[\s\S]*\+10 XP/), s);
    msg(dave, '/agents'); await waitFor('agents', sent('RYUJIN', /fifteen agents/), s);
    msg(dave, '/ask what is hot today?'); await waitFor('ask', sent('RYUJIN', /answers in this group soon.*app\.mekaneko\.com/), s);
  });
  await step('KOKEKO: /announce is team only, posts to the channel and pins it there, also from a DM', async () => {
    let s = since(); msg(dave, '/announce Hello'); await waitFor('refused', sent('KOKEKO', /Team only/), s);
    const cmd = msg(OWNER, '/announce Big news\nThe zodiac is waking up.');
    await waitFor('announcement in the channel', sent('KOKEKO', /📣 <b>Big news<\/b>[\s\S]*zodiac is waking up/, CHANNEL.id), s);
    await waitFor('pinned in the channel', (c) => c.bot === 'KOKEKO' && c.method === 'pinChatMessage' && c.body.chat_id === CHANNEL.id, s);
    await waitFor('command tidied', (c) => c.bot === 'KOKEKO' && c.method === 'deleteMessage' && c.body.message_id === cmd.message_id, s);
    s = since();
    queues.KOKEKO.push({ update_id: ++up, message: { message_id: ++mid, date: 0, chat: { id: 1, type: 'private', first_name: 'Owner' }, from: OWNER, text: '/announce From my phone', entities: [{ type: 'bot_command', offset: 0, length: 9 }] } });
    await waitFor('DM announcement in the channel', sent('KOKEKO', /From my phone/, CHANNEL.id), s);
    await waitFor('DM confirmation', sent('KOKEKO', /Posted in the channel and pinned/, 1), s);
  });
  await step('SHURU: a message sent as another channel is removed; our own auto-forwarded channel post stays', async () => {
    const s = since(), fake = { id: 136817688, is_bot: true, first_name: 'Channel', username: 'Channel_Bot' };
    const spam = msg(fake, 'Best signals here', { sender_chat: { id: -100888, type: 'channel', title: 'Pump signals' } });
    const fwd = msg(fake, '📣 Big news', { sender_chat: CHANNEL, is_automatic_forward: true });
    await waitFor('delete spam', (c) => c.bot === 'SHURU' && c.method === 'deleteMessage' && c.body.message_id === spam.message_id, s);
    await waitFor('notice', sent('SHURU', /sent as the channel “Pump signals”/), s);
    await none('delete our channel post', (c) => c.method === 'deleteMessage' && c.body.message_id === fwd.message_id, s);
  });
  await step('MEEMEE contest: a picture, 🔥 votes, results with +500 XP; PYON pays +100 for a picture 5 members react to', async () => {
    const s = since(); msg(OWNER, '/contest start 1 Best cat'); await waitFor('contest post', sent('MEEMEE', /meme contest: Best cat/), s);
    await new Promise((r) => setTimeout(r, 200));
    const pic = msg(dave, null, { photo: [{ file_id: 'p1', file_unique_id: 'u1', width: 10, height: 10 }], caption: 'my cat' });
    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 5; i++) react(user(200 + i, `Fan${i}`), pic.message_id, '🔥');
    await new Promise((r) => setTimeout(r, 400));
    msg(OWNER, '/contest end');
    await waitFor('results', sent('MEEMEE', /results: Best cat[\s\S]*id=104[\s\S]*5 🔥[\s\S]*\+500 XP/), s);
    await waitFor('meme XP log', () => /\+100 104 \(meme\)/.test(out), s).catch(() => assert.fail('no +100 meme XP for Dave'));
  });
  await step('other groups are left; DMs get an intro, and /check works there', async () => {
    const s = since(); msg(alice, 'hi', {}, { id: -999, type: 'supergroup', title: 'Random group' });
    await waitFor('leave -999', (c) => c.method === 'leaveChat' && c.body.chat_id === -999, s);
    const dm = { id: 100, type: 'private', first_name: 'Alice' };
    queues.HACHI.push({ update_id: ++up, message: { message_id: ++mid, date: 0, chat: dm, from: alice, text: '/start', entities: [{ type: 'bot_command', offset: 0, length: 6 }] } });
    await waitFor('HACHI intro', sent('HACHI', /I’m HACHI[\s\S]*t\.me\/mekanekoworld/, 100), s);
    queues.SHURU.push({ update_id: ++up, message: { message_id: ++mid, date: 0, chat: dm, from: alice, text: '/check nope', entities: [{ type: 'bot_command', offset: 0, length: 6 }] } });
    await waitFor('SHURU check usage', sent('SHURU', /Send it like this/, 100), s);
  });
  await step('levels are saved on shutdown', async () => {
    child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r));
    const f = pjoin(data, 'levels.json'); assert.ok(existsSync(f));
    const d = JSON.parse(readFileSync(f, 'utf8')); assert.ok(d.users['104']?.xp > 500, `Dave XP ${d.users['104']?.xp}`); assert.equal(d.users['104'].name, 'Dave');
  });
  console.log(`bots: ${n} end-to-end tests passed`);
  server.close();
} catch (e) { fail(e); }
