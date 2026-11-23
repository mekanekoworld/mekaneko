// MEEMEE 🐐 community for the Telegram group: /omikuji (a daily fortune slip, +10 XP once a day, same slip as on Discord for the day)
// and meme contests: an admin starts one, members post pictures, everyone votes with 🔥 (⭐ is not a Telegram reaction),
// MEEMEE counts the votes and pays XP to the top 3. No AI.
import { omikuji } from '../vendor/content.mjs';
import { day } from '../vendor/levels.mjs';
import { esc, mention, nameOf, L, log, FAST, reply } from '../tg.mjs';

const VOTE = '🔥', PRIZES = [500, 300, 200];
const MEDIA = (m) => m.photo || m.video || m.animation;
const link = (chatId, msgId) => `https://t.me/c/${String(chatId).replace(/^-100/, '')}/${msgId}`;

export default {
  updates: ['message', 'message_reaction', 'my_chat_member'],
  commands: [
    { command: 'omikuji', en: 'Draw today’s fortune slip 🎋', ja: '今日のおみくじを引く 🎋' },
    { command: 'contest', en: 'Admins: /contest start [days] theme · /contest end', ja: '管理者: /contest start [日数] テーマ · /contest end', admin: true },
  ],
  intro: ['🐐 I’m MEEMEE! Draw your daily fortune with /omikuji in the MEKANEKO group, and join the meme contests there.',
    '🐐 MEEMEE です！MEKANEKO グループで /omikuji を引いて、ミームコンテストにも参加してね。'],
  setup(bot, ctx) {
    const api = bot.api, db = ctx.json('meemee.json', { omikuji: {}, contest: null, past: [] });

    bot.command('omikuji', async (c) => {
      if (c.chat.id !== ctx.chatId) return reply(c, L(c.from, 'Draw it in the MEKANEKO group, nyan.', 'MEKANEKO グループで引いてね。'));
      const today = day(), d = db.get(), first = d.omikuji[c.from.id] !== today;
      const { fortune: [kanji, romaji, en, , lineEn, lineJa], agent } = omikuji(String(c.from.id), today);
      if (first) { d.omikuji[c.from.id] = today; db.set(d); await ctx.grant(c.from, 10, 'omikuji'); }
      return reply(c, `🎋 <b>${kanji} ${romaji} · ${en}</b>\n${esc(lineEn)}\n${esc(lineJa)}\n\nLucky agent: <b>${agent}</b>${first ? '\n+10 XP for today’s first draw.' : '\n(Same slip until tomorrow, nyan.)'}\n<i>Just for fun, never financial advice.</i>`);
    });

    // ---------- contests ----------
    const end = async (by) => {
      const d = db.get(), con = d.contest; if (!con) return null;
      const best = new Map();                                          // one place per member: their best entry
      for (const [id, e] of Object.entries(con.entries).sort((a, b) => b[1].votes.length - a[1].votes.length || a[1].t - b[1].t))
        if (e.votes.length && !best.has(e.author.id)) best.set(e.author.id, { id: Number(id), ...e });
      const top = [...best.values()].slice(0, 3);
      for (const [i, s] of top.entries()) await ctx.grant(s.author, PRIZES[i], `meme contest #${i + 1}`);
      d.past.push({ theme: con.theme, start: con.start, end: Date.now(), by, top: top.map((s) => ({ id: s.id, author: s.author.id, votes: s.votes.length })) });
      d.contest = null; db.set(d);
      await ctx.say(api, `🏆 <b>Meme contest results: ${esc(con.theme)}</b>\n\n${top.length
        ? top.map((s, i) => `${['🥇', '🥈', '🥉'][i]} ${mention(s.author)} · ${s.votes.length} ${VOTE} · <a href="${link(ctx.chatId, s.id)}">see it</a> · +${PRIZES[i]} XP`).join('\n') + '\n\nThanks for playing, nyan~'
        : 'No votes this time. Next contest soon!'}`).catch((e) => log('meemee results', e.description || e.message));
      return top;
    };
    setInterval(() => { const con = db.get().contest; if (con && Date.now() >= con.end) end('timer').catch((e) => log('meemee end', e.message)); }, FAST ? 300 : 5 * 60_000);

    bot.command('contest', async (c) => {
      if (c.chat.id !== ctx.chatId) return;
      if (!await ctx.isAdmin(api, c.from, c.msg)) return reply(c, L(c.from, 'Admins only.', '管理者専用です。'));
      const [sub, ...rest] = String(c.match || '').trim().split(/\s+/), d = db.get();
      if (sub === 'start') {
        if (d.contest) return reply(c, `A contest is running already: <b>${esc(d.contest.theme)}</b>. End it first with /contest end.`);
        const days = /^\d{1,2}$/.test(rest[0] || '') ? Math.min(14, Math.max(1, Number(rest.shift()))) : 7, theme = rest.join(' ').slice(0, 100);
        if (!theme) return reply(c, 'Write it like this: /contest start 7 Your theme here');
        const endsAt = Date.now() + days * 86_400_000;
        const m = await ctx.say(api, `🐐 <b>MEEMEE’s meme contest: ${esc(theme)}</b>\n\nPost your meme <b>as a picture</b> in this group within ${days} day${days > 1 ? 's' : ''}. Vote for others with ${VOTE} (your own doesn’t count).\nPrizes: 🥇 +${PRIZES[0]} XP · 🥈 +${PRIZES[1]} XP · 🥉 +${PRIZES[2]} XP\n\nテーマ：${esc(theme)}　画像で投稿して、${VOTE} で投票！`);
        d.contest = { theme, start: Date.now(), end: endsAt, msg: m.message_id, by: c.from.id, entries: {} }; db.set(d);
        api.pinChatMessage(ctx.chatId, m.message_id, { disable_notification: true }).catch(() => {});
        return;
      }
      if (sub === 'end') {
        if (!d.contest) return reply(c, 'No contest is running.');
        const top = await end(c.from.id); return reply(c, top?.length ? `Ended. Winner: ${esc(nameOf(top[0].author))}` : 'Ended. No votes.');
      }
      return reply(c, '/contest start [days] theme · /contest end');
    });

    bot.on('message', async (c, next) => {                             // entries: pictures posted while a contest runs
      const m = c.msg, d = db.get();
      if (d.contest && c.chat.id === ctx.chatId && m.from && !m.from.is_bot && !m.sender_chat && MEDIA(m) && Date.now() < d.contest.end) {
        d.contest.entries[m.message_id] = { author: { id: m.from.id, first_name: m.from.first_name, last_name: m.from.last_name, username: m.from.username }, t: Date.now(), votes: [] };
        db.set(d);
      }
      return next();
    });
    bot.on('message_reaction', (c) => {
      const r = c.messageReaction, d = db.get(), e = d.contest?.entries[r.message_id];
      if (!e || !r.user || r.user.is_bot || r.user.id === e.author.id) return;
      const voted = r.new_reaction.some((x) => x.type === 'emoji' && x.emoji === VOTE), has = e.votes.includes(r.user.id);
      if (voted && !has) e.votes.push(r.user.id); else if (!voted && has) e.votes = e.votes.filter((v) => v !== r.user.id); else return;
      db.set(d);
    });
  },
};
