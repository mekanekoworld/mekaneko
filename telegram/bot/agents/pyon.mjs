// PYON 🐰 levels for the Telegram group, with the same rules as on Discord (vendor/levels.mjs) but its own XP file:
// chat XP (once a minute, no short or repeated messages), the daily GM streak, +100 for a picture 5 other members react to,
// /rank (reply to someone to see theirs), /leaderboard and /award (admins). No AI.
import * as LV from '../vendor/levels.mjs';
import { esc, nameOf, L, log, reply } from '../tg.mjs';

const bar = (into, next, n = 14) => { const k = Math.round((into / next) * n); return '▰'.repeat(k) + '▱'.repeat(n - k); };
const MEDIA = (m) => m.photo || m.video || m.animation;

export default {
  updates: ['message', 'message_reaction', 'my_chat_member'],
  commands: [
    { command: 'rank', en: 'Your MEKANEKO level (reply to someone to see theirs)', ja: 'あなたのレベル（返信で相手のレベル）' },
    { command: 'leaderboard', en: 'The top 10 cats', ja: 'トップ10' },
    { command: 'award', en: 'Admins: reply to someone with /award solved|bug|contest|<XP>', ja: '管理者: 返信で /award solved|bug|contest|<XP>', admin: true },
  ],
  intro: ['🐰 I’m PYON, I keep the levels in the MEKANEKO group. Chat there, say GM every day and use /rank.',
    '🐰 PYON です。MEKANEKO グループのレベル担当。チャットして、毎日 GM して、/rank で確認してね。'],
  setup(bot, ctx) {
    const { store } = ctx, api = bot.api;
    const media = new Map();                                           // recent pictures: message id -> { author, fans }

    bot.on('message', async (c, next) => {
      const m = c.msg, u = m.from;
      if (c.chat.id !== ctx.chatId || !u || u.is_bot || m.sender_chat) return next();
      try {
        const text = m.text ?? m.caption ?? '';
        store.user(String(u.id)).name = nameOf(u); store.dirty = true;
        if (MEDIA(m)) { media.set(m.message_id, { author: u, fans: new Set() }); if (media.size > 3000) media.delete(media.keys().next().value); }
        if (!text.startsWith('/')) {
          const rec = store.user(String(u.id));
          let xp = LV.onMessage(rec, text);
          if (LV.isGM(text)) {
            const g = LV.onGM(rec);
            if (g) {
              xp += g.xp;
              api.setMessageReaction(c.chat.id, m.message_id, [{ type: 'emoji', emoji: '🔥' }]).catch(() => {});
              if (LV.RULES.gm.streakBonus[g.streak]) reply(c, `🔥 ${g.streak}-day GM streak! +${g.xp} XP`).catch(() => {});
            }
          }
          await ctx.grant(u, xp);
        }
      } catch (e) { log('pyon message', e.message); }
      return next();
    });

    bot.on('message_reaction', async (c) => {
      const r = c.messageReaction, who = r.user, pic = media.get(r.message_id);
      if (!pic || !who || who.is_bot || who.id === pic.author.id) return;
      if (r.new_reaction.length) pic.fans.add(who.id); else pic.fans.delete(who.id);
      const key = `tg${r.message_id}`;
      if (pic.fans.size >= LV.RULES.meme.reactors && !store.d.memes[key]) { store.d.memes[key] = Date.now(); store.dirty = true; await ctx.grant(pic.author, LV.RULES.meme.xp, 'meme'); }
    });

    bot.command('rank', (c) => {
      const t = c.msg.reply_to_message?.from, who = t && !t.is_bot ? t : c.from, rec = store.d.users[String(who.id)] || { xp: 0, streak: 0 };
      const lv = LV.levelOf(rec.xp), m = LV.milestoneFor(lv.level), nextM = LV.MILESTONES.find(([l]) => l > lv.level);
      return reply(c, [`🐰 <b>${esc(nameOf(who))}</b> · Level ${lv.level}${m ? ` · ${esc(m[2])}` : ''}`,
        `${bar(lv.into, lv.next)}  ${lv.into.toLocaleString()} / ${lv.next.toLocaleString()} XP`,
        `Total ${rec.xp.toLocaleString()} XP · Rank ${rec.xp ? `#${store.rank(String(who.id))}` : '-'} · GM streak ${rec.streak ? `${rec.streak} day${rec.streak > 1 ? 's' : ''}` : '-'}`,
        ...(nextM ? [L(c.from, `Next: level ${nextM[0]}, ${esc(nextM[2])}`, `次: レベル${nextM[0]}「${esc(nextM[2])}」`)] : [])].join('\n'));
    });

    bot.command('leaderboard', (c) => {
      const top = store.top(10), medal = ['🥇', '🥈', '🥉'];
      return reply(c, top.length ? [`🏆 <b>MEKANEKO leaderboard</b> (Telegram)`, '',
        ...top.map(([, u], i) => `${medal[i] || `${i + 1}.`} ${esc(u.name || 'cat')} · Lv ${LV.levelOf(u.xp).level} · ${u.xp.toLocaleString()} XP`)].join('\n')
        : L(c.from, 'No XP yet. Say GM nya!', 'まだ XP がありません。GM ニャ！'));
    });

    bot.command('award', async (c) => {
      if (!await ctx.isAdmin(api, c.from, c.msg)) return reply(c, L(c.from, 'Admins only.', '管理者専用です。'));
      const who = c.msg.reply_to_message?.from, arg = String(c.match || '').trim().toLowerCase();
      if (!who || who.is_bot) return reply(c, 'Reply to the member’s message with /award solved, /award bug, /award contest or /award 250.');
      const amount = LV.RULES.award[arg] ?? (/^-?\d{1,4}$/.test(arg) ? Number(arg) : 0);
      if (!amount) return reply(c, `Pick one: solved (+${LV.RULES.award.solved}), bug (+${LV.RULES.award.bug}), contest (+${LV.RULES.award.contest}) or a number.`);
      await ctx.grant(who, amount, `award ${arg} by ${c.from.id}`);
      return reply(c, `🏅 ${amount > 0 ? '+' : ''}${amount} XP for ${esc(nameOf(who))}. Now ${store.user(String(who.id)).xp.toLocaleString()} XP.`);
    });
  },
};
