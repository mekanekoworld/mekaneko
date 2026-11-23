// SHURU 🐍 security for the Telegram group. Telegram has no AutoMod, so SHURU does that job here:
//   - a captcha for every new member (muted until they tap the right emoji; no answer in 3 minutes or two wrong taps = removed, may rejoin)
//   - the message filter (rules.mjs): scam words, links outside the official list, invites, risky files, early forwards
//   - look-alike names (MEKANEKO staff, the agents, the admins): muted until the name changes
//   - /check <address>: a token contract on Robinhood Chain + DexScreener (same as on Discord)
//   - messages written "as" another channel (a spam trick in channel discussion groups)
// Needs admin with "Delete messages" and "Ban users". No AI.
import { InlineKeyboard } from 'grammy';
import { inspect, mentionsOf, REASON } from '../rules.mjs';
import { nameFlags } from '../vendor/common.mjs';
import { TOOLS, CHAIN } from '../vendor/tools.mjs';
import * as LV from '../vendor/levels.mjs';
import { esc, mention, nameOf, L, log, FAST, reply, threadOf, HTML } from '../tg.mjs';

const CAPTCHA_MS = FAST ? 1500 : 3 * 60_000, NOTICE_MS = FAST ? 400 : 30_000, STRIKES = 3, STRIKE_WINDOW = 60 * 60_000, MUTE_S = 60 * 60;
const TARGETS = [['🐟', 'fish', '魚'], ['🐭', 'mouse', 'ネズミ'], ['🧶', 'yarn', '毛糸'], ['🔔', 'bell', '鈴'], ['🍣', 'sushi', '寿司'], ['🐾', 'paw', '肉球']];
const NONE = Object.fromEntries(['can_send_messages', 'can_send_audios', 'can_send_documents', 'can_send_photos', 'can_send_videos', 'can_send_video_notes',
  'can_send_voice_notes', 'can_send_polls', 'can_send_other_messages', 'can_add_web_page_previews', 'can_change_info', 'can_invite_users',
  'can_pin_messages', 'can_manage_topics'].map((k) => [k, false]));
const ALL = Object.fromEntries(Object.keys(NONE).map((k) => [k, true]));   // all true = back to the group's default permissions
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (n) => (n == null ? '-' : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);
const pct = (n) => (n == null ? '-' : `${n > 0 ? '+' : ''}${(+n).toFixed(1)}%`);
const age = (iso) => { if (!iso) return '-'; const h = (Date.now() - Date.parse(iso)) / 3_600_000; return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export default {
  updates: ['message', 'edited_message', 'chat_member', 'callback_query', 'my_chat_member'],
  commands: [{ command: 'check', en: 'SHURU reads a token contract on Robinhood Chain', ja: 'SHURU が Robinhood Chain のトークンを調べる', dm: true }],
  intro: ['🐍 I’m SHURU, MEKANEKO’s security agent. In the group I keep scams out, and anyone can use /check 0x… to read a contract. Here in DMs, /check works too.',
    '🐍 MEKANEKO のセキュリティ担当 SHURU です。グループでは詐欺を防ぎ、/check 0x… でコントラクトを調べられます。DMでも /check が使えます。'],
  setup(bot, ctx) {
    const api = bot.api, pend = ctx.json('captcha.json', {}), held = ctx.json('names.json', {});
    const strikes = new Map(), recentJoin = new Map(), chats = new Map();

    // names a scammer would copy: MEKANEKO, Meka-kun, the agents, and the group's human admins
    let staff = [['MEKANEKO', false], ['Meka-kun', true], ...['RYUJIN', 'SHURU', 'KOKEKO', 'MEEMEE'].map((n) => [n, true]), ['HACHI', false], ['PYON', false]];
    const base = staff;
    const refreshStaff = async () => {
      try { const a = await ctx.admins(api, true); staff = [...base, ...a.list.filter((u) => !u.is_bot).flatMap((u) => [[nameOf(u), true], ...(u.username ? [[u.username, true]] : [])])]; }
      catch (e) { log('shuru admins', e.message); }
    };
    ctx.events.once('ready', () => { if (ctx.chatId) { refreshStaff(); setInterval(refreshStaff, 30 * 60_000); } });
    const flagsOf = (u) => nameFlags([nameOf(u), u.username], staff);

    const kick = async (uid) => { await api.banChatMember(ctx.chatId, uid); await api.unbanChatMember(ctx.chatId, uid, { only_if_banned: true }); };

    // ---------- captcha ----------
    const startCaptcha = async (user) => {
      const t = Math.floor(Math.random() * TARGETS.length);
      const opts = shuffle([t, ...shuffle([...TARGETS.keys()].filter((i) => i !== t)).slice(0, 3)]);
      await api.restrictChatMember(ctx.chatId, user.id, NONE);
      const kb = new InlineKeyboard(); for (const i of opts) kb.text(TARGETS[i][0], `cap:${user.id}:${i}`);
      const [e, en, ja] = TARGETS[t];
      const m = await ctx.say(api, `🐍 ${mention(user)}, welcome to MEKANEKO World! Tap the <b>${e} ${en}</b> below within 3 minutes to start chatting.\nようこそ！3分以内に下の <b>${e}（${ja}）</b> をタップしてね。`, { reply_markup: kb });
      const d = pend.get(); d[user.id] = { msg: m.message_id, deadline: Date.now() + CAPTCHA_MS, target: t, tries: 0 }; pend.set(d);
      setTimeout(() => expire(user.id), CAPTCHA_MS + 50);
    };
    const expire = async (uid) => {
      const d = pend.get(), p = d[uid]; if (!p || Date.now() < p.deadline) return;
      delete d[uid]; pend.set(d);
      api.deleteMessage(ctx.chatId, p.msg).catch(() => {});
      await kick(uid).catch((e) => log('shuru kick', uid, e.description || e.message));
      log(`shuru captcha: no answer from ${uid}, removed (may rejoin)`);
    };
    ctx.events.once('ready', () => { for (const [uid, p] of Object.entries(pend.get())) setTimeout(() => expire(uid), Math.max(0, p.deadline - Date.now()) + 50); });

    const onJoin = async (user, by) => {
      if (user.is_bot || Date.now() - (recentJoin.get(user.id) || 0) < 60_000) return;
      recentJoin.set(user.id, Date.now());
      try {
        if (by && by.id !== user.id && await ctx.isAdmin(api, by)) { ctx.events.emit('verified', user); return; }   // an admin added them
        if (await ctx.isAdmin(api, user)) return;
        const flags = flagsOf(user);
        if (flags.length) return await hold(user, flags, true);
        await startCaptcha(user);
      } catch (e) { log('shuru join', user.id, e.description || e.message); }
    };
    bot.on('chat_member', (c) => {
      const { old_chat_member: o, new_chat_member: n, from } = c.chatMember;
      const inside = (m) => ['member', 'administrator', 'creator'].includes(m.status) || (m.status === 'restricted' && m.is_member);
      if (!inside(o) && inside(n)) return onJoin(n.user, from);
    });
    bot.on('message:new_chat_members', async (c) => {                // also the service message: catches joins if chat_member is late
      c.deleteMessage().catch(() => {});
      for (const u of c.msg.new_chat_members) await onJoin(u, c.from);
    });
    bot.on('message:left_chat_member', (c) => c.deleteMessage().catch(() => {}));

    bot.callbackQuery(/^cap:(\d+):(\d+)$/, async (c) => {
      const uid = c.match[1], pick = Number(c.match[2]);
      if (String(c.from.id) !== uid) return c.answerCallbackQuery({ text: L(c.from, 'This button is for the new member, nyan.', 'これは新しいメンバー用のボタンです。') });
      const d = pend.get(), p = d[uid]; if (!p) return c.answerCallbackQuery();
      if (pick === p.target) {
        delete d[uid]; pend.set(d);
        await api.restrictChatMember(ctx.chatId, Number(uid), ALL).catch((e) => log('shuru unmute', e.description || e.message));
        api.deleteMessage(ctx.chatId, p.msg).catch(() => {});
        await c.answerCallbackQuery({ text: L(c.from, 'Welcome to MEKANEKO World! 🐾', 'MEKANEKO World へようこそ！🐾') });
        ctx.events.emit('verified', c.from); log(`shuru captcha: ${uid} passed`); return;
      }
      if (++p.tries >= 2) {
        delete d[uid]; pend.set(d);
        await c.answerCallbackQuery({ text: L(c.from, 'Two wrong taps. Rejoin with the invite link to try again.', '2回まちがえました。招待リンクから入り直して、もう一度どうぞ。'), show_alert: true });
        api.deleteMessage(ctx.chatId, p.msg).catch(() => {});
        await kick(Number(uid)).catch(() => {}); log(`shuru captcha: ${uid} failed twice, removed`); return;
      }
      pend.set(d);
      return c.answerCallbackQuery({ text: L(c.from, 'Not that one. One more try!', 'ちがうよ。あと1回！'), show_alert: true });
    });

    // ---------- look-alike names ----------
    const hold = async (user, flags, join = false) => {
      const d = held.get(); if (d[user.id] && Date.now() - d[user.id].at < 10 * 60_000) return;
      await api.restrictChatMember(ctx.chatId, user.id, NONE).catch((e) => log('shuru hold', e.description || e.message));
      const kb = new InlineKeyboard().text(L(user, '✅ I changed my name', '✅ 名前を変えました'), `nm:${user.id}`);
      const m = await ctx.say(api, `🐍 ${mention(user)}, your name looks like MEKANEKO staff or one of our agents, so you can’t post yet. Change your Telegram name, then tap the button.\nお名前が MEKANEKO のスタッフやエージェントに似ているため、まだ投稿できません。Telegram の名前を変えてからボタンを押してください。`, { reply_markup: kb });
      d[user.id] = { at: Date.now(), msg: m.message_id, join }; held.set(d);
      log(`shuru name hold ${user.id}: ${flags.join('; ')}`);
      ctx.modlog(api, `🐍 Name hold: ${mention(user)} (ID ${user.id})\n${flags.map((f) => '• ' + esc(f)).join('\n')}`);
    };
    bot.callbackQuery(/^nm:(\d+)$/, async (c) => {
      const uid = Number(c.match[1]);
      if (c.from.id !== uid) return c.answerCallbackQuery({ text: L(c.from, 'Not your button.', 'あなたのボタンではありません。') });
      if (flagsOf(c.from).length) return c.answerCallbackQuery({ text: L(c.from, 'Your name still looks like staff. Change it first, nyan.', 'まだスタッフに似た名前です。先に名前を変えてね。'), show_alert: true });
      const d = held.get(), p = d[uid]; delete d[uid]; held.set(d);
      if (p?.msg) api.deleteMessage(ctx.chatId, p.msg).catch(() => {});
      await c.answerCallbackQuery({ text: L(c.from, 'Thanks! 🐾', 'ありがとう！🐾') });
      if (p?.join) return startCaptcha(c.from).catch((e) => log('shuru captcha', e.description || e.message));   // a new member still owes the captcha
      await api.restrictChatMember(ctx.chatId, uid, ALL).catch(() => {});
    });

    // ---------- the filter ----------
    const foreignChat = async (handle) => {                            // a public channel or group that isn't ours
      const k = handle.toLowerCase(), hit = chats.get(k);
      if (hit && Date.now() - hit.at < 86_400_000) return hit.foreign;
      let foreign = false;
      try { const ch = await api.getChat(handle); foreign = ['channel', 'group', 'supergroup'].includes(ch.type) && ch.id !== ctx.chatId; } catch {}
      chats.set(k, { at: Date.now(), foreign }); return foreign;
    };
    const moderate = async (c, msg) => {
      if (!msg || c.chat?.id !== ctx.chatId) return;
      if (msg.sender_chat) {                                           // written "as a channel": ours is fine (auto-forwarded posts, anonymous admins)
        if ([ctx.chatId, ctx.channelId].includes(msg.sender_chat.id) || msg.is_automatic_forward) return;
        await api.deleteMessage(ctx.chatId, msg.message_id).catch(() => {});
        const n = await ctx.say(api, `🐍 Removed a message sent as the channel “${esc(msg.sender_chat.title || '?')}”. In this group, please write as yourself.
チャンネル名義のメッセージは削除しました。このグループでは個人として投稿してください。`, threadOf(msg)).catch(() => null);
        if (n) ctx.later(api, n.message_id, NOTICE_MS);
        log(`shuru removed a message sent as channel ${msg.sender_chat.id}`); return;
      }
      if (!msg.from || msg.from.is_bot) return;
      if (await ctx.isAdmin(api, msg.from, msg)) return;
      const u = msg.from, level = ctx.level(u.id);
      const flags = flagsOf(u);
      if (flags.length) { await api.deleteMessage(ctx.chatId, msg.message_id).catch(() => {}); return hold(u, flags); }
      let v = inspect(msg, level);
      if (!v && level < 20) for (const h of mentionsOf(msg)) if (await foreignChat(h)) { v = { kind: 'invite', detail: h }; break; }
      if (!v) return;
      await api.deleteMessage(ctx.chatId, msg.message_id).catch((e) => log('shuru delete', e.description || e.message));
      await ctx.grant(u, -LV.RULES.automodPenalty, `filter ${v.kind}`);
      const s = (strikes.get(u.id) || []).filter((t) => Date.now() - t < STRIKE_WINDOW); s.push(Date.now()); strikes.set(u.id, s);
      const muted = s.length >= STRIKES;
      if (muted) { await api.restrictChatMember(ctx.chatId, u.id, NONE, { until_date: Math.floor(Date.now() / 1000) + MUTE_S }).catch(() => {}); strikes.delete(u.id); }
      const [en, ja] = REASON[v.kind];
      const n = await ctx.say(api, `🐍 Removed a message from ${mention(u)}: ${en}.${muted ? ' Muted for 1 hour (3 removals in an hour).' : ''} Official links: /links\n${ja}を含むため削除しました。${muted ? '（1時間に3回のため、1時間ミュート）' : ''}`, threadOf(msg)).catch(() => null);
      if (n) ctx.later(api, n.message_id, NOTICE_MS);
      log(`shuru removed ${v.kind} from ${u.id}${muted ? ' (muted 1 h)' : ''}: ${String(v.detail).slice(0, 80)}`);
      ctx.modlog(api, `🐍 Removed (${v.kind}) from ${mention(u)} (ID ${u.id})${muted ? ', muted 1 h' : ''}\n<code>${esc(String(msg.text ?? msg.caption ?? v.detail).slice(0, 300))}</code>`);
    };
    bot.on(['message', 'edited_message'], async (c, next) => { try { await moderate(c, c.msg); } catch (e) { log('shuru filter', e.description || e.message); } return next(); });

    // ---------- /check <address> ----------
    const last = new Map();
    bot.command('check', async (c) => {
      const a = String(c.match || '').trim();
      if (!ADDR.test(a)) return reply(c, L(c.from, 'Send it like this: <code>/check 0x…</code> (0x followed by 40 characters).', 'こう送ってください: <code>/check 0x…</code>（0x と40文字）'));
      const wait = 30_000 - (Date.now() - (last.get(c.from.id) || 0));
      if (wait > 0) return reply(c, L(c.from, `One check every 30 seconds, please. Try again in ${Math.ceil(wait / 1000)} s.`, `チェックは30秒に1回まで。${Math.ceil(wait / 1000)}秒後にどうぞ。`));
      last.set(c.from.id, Date.now());
      const note = await reply(c, '🐍 Reading Robinhood Chain…');
      const edit = (t) => api.editMessageText(c.chat.id, note.message_id, t, HTML);
      try {
        const [chain, market] = await Promise.all([TOOLS.token_onchain.run({ address: a }), TOOLS.market_token.run({ address: a }).catch(() => ({ found: false }))]);
        if (!chain.is_contract) return edit(`🐍 <code>${short(a)}</code>: no contract code at this address on Robinhood Chain. It is a wallet, or the token lives on another chain.`);
        const p = market.found ? market.main_pair : null;
        const lines = [`🐍 <b>SHURU check · ${esc(chain.name || 'Unknown')} ($${esc(chain.symbol || '?')})</b>`, `<code>${a}</code> · Robinhood Chain`, '',
          `Contract: ✅ ERC-20 · ${chain.total_supply != null ? Number(chain.total_supply).toLocaleString('en-US') : '?'} supply`,
          `Owner: ${chain.ownership_renounced ? '✅ renounced' : chain.owner ? `⚠️ controlled by <code>${short(chain.owner)}</code>` : '❔ no owner() function'}`,
          `Burned: ${chain.burned_pct != null ? `${chain.burned_pct}%` : '-'}`,
          `Liquidity: ${p ? `${p.liquidity_usd < 50_000 ? '⚠️ ' : ''}${usd(p.liquidity_usd)}` : '⚠️ no DEX pair found'}`,
          ...(p ? [`24h: ${pct(p.change_24h_pct)} · vol ${usd(p.volume_24h_usd)} · ${p.buys_24h ?? '?'} buys / ${p.sells_24h ?? '?'} sells`,
            `Pair age: ${/h$/.test(age(p.created)) ? '⚠️ ' : ''}${age(p.created)} · ${esc(p.dex || '-')}`] : []),
          '', `<a href="${CHAIN.explorer}/token/${a}">Explorer</a>${p?.url ? ` · <a href="${esc(p.url)}">Chart</a>` : ''}`,
          '<i>Not checked: holder spread, verified source code, taxes/honeypot. Look on the explorer before you buy. Not financial advice.</i>'];
        await edit(lines.join('\n'));
      } catch (e) { log('shuru check', e.message); await edit('🐍 The chain didn’t answer just now. Try again in a minute.').catch(() => {}); }
    });
  },
};
