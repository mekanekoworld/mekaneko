// MEEMEE 🐐 community: /omikuji (a daily fortune slip, +10 XP once a day) and weekly meme contests in #memes-art
// (team starts one; members post images and vote with ⭐; MEEMEE counts and pays XP to the top 3). No AI.
import { GatewayIntentBits as I, Events, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { omikuji } from '../content.mjs';
import { day } from '../levels.mjs';

const STAR = '⭐', PRIZES = [500, 300, 200];

export default {
  intents: [I.Guilds],
  status: 'Daily fortune · /omikuji',
  setup(client, ctx) {
    const { C } = ctx;
    const db = ctx.json('meemee.json', { omikuji: {}, contest: null, past: [] });

    async function endContest(guild, by) {
      const d = db.get(), c = d.contest; if (!c) return null;
      const ch = await ctx.read(C.memes);                                // PYON reads: attachments need the Message Content intent
      const entries = []; let before;
      for (let page = 0; page < 10; page++) {                           // up to 1,000 messages since the start
        const batch = await ch.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!batch.size) break;
        for (const m of batch.values()) if (m.createdTimestamp >= c.start && m.createdTimestamp <= c.end && !m.author.bot && m.attachments.size) entries.push(m);
        before = batch.last().id; if (batch.last().createdTimestamp < c.start) break;
      }
      const scored = [];
      for (const m of entries) {
        const r = m.reactions.cache.find((x) => x.emoji.name === STAR);
        const voters = r ? (await r.users.fetch()).filter((u) => !u.bot && u.id !== m.author.id).size : 0;
        if (voters) scored.push({ id: m.id, url: m.url, author: m.author.id, votes: voters, t: m.createdTimestamp });
      }
      const best = new Map();                                            // one place per member: their best entry
      for (const s of scored.sort((a, b) => b.votes - a.votes || a.t - b.t)) if (!best.has(s.author)) best.set(s.author, s);
      const top = [...best.values()].slice(0, 3);
      for (const [i, s] of top.entries()) await ctx.grant(s.author, PRIZES[i], `meme contest #${i + 1}`);
      d.past.push({ ...c, ended: Date.now(), by, top }); d.contest = null; db.set(d);
      const post = guild.channels.cache.get(C.memes);
      await post.send({ embeds: [{ color: 0xF5B342, title: `🏆 Meme contest results: ${c.theme}`,
        description: top.length ? top.map((s, i) => `${['🥇', '🥈', '🥉'][i]} <@${s.author}> · ${s.votes} ${STAR} · [see it](${s.url}) · +${PRIZES[i]} XP`).join('\n')
          + '\n\nThe winner gets a spotlight on X. Thanks for playing, nyan~' : `No votes this time. Next contest soon!`, footer: { text: 'MEEMEE · meme contests' } }],
        allowedMentions: { users: top.map((s) => s.author) } });
      return top;
    }
    setInterval(() => { const c = db.get().contest, guild = ctx.guild('meemee'); if (c && guild && Date.now() >= c.end) endContest(guild, 'timer').catch((e) => ctx.log('meemee end', e.message)); }, 5 * 60_000);

    client.on(Events.InteractionCreate, async (it) => {
      if (!it.isChatInputCommand() || it.guildId !== ctx.ids.guild) return;
      try {
        if (it.commandName === 'omikuji') {
          const today = day(), d = db.get(), first = d.omikuji[it.user.id] !== today;
          const { fortune: [kanji, romaji, en, , lineEn, lineJa], agent, pick } = omikuji(it.user.id, today);
          const stickers = it.guild.emojis.cache.filter((e) => e.name.startsWith('mk_') && !e.animated).map((e) => e.toString());
          const lucky = stickers.length ? stickers[pick % stickers.length] : '🐾';
          if (first) { d.omikuji[it.user.id] = today; db.set(d); await ctx.grant(it.user.id, 10, 'omikuji'); }
          return it.reply({ embeds: [{ color: kanji === '凶' ? 0x5865F2 : 0xF5B342, title: `🎋 ${kanji} ${romaji} · ${en}`,
            description: `${lineEn}\n${lineJa}\n\nLucky agent: **${agent}** · Lucky sticker: ${lucky}${first ? '\n+10 XP for today’s first draw.' : '\n(Same slip until tomorrow, nyan.)'}`,
            footer: { text: 'MEEMEE’s omikuji · just for fun, never financial advice' } }] });
        }
        if (it.commandName === 'contest') {
          if (!ctx.isTeam(it.member)) return it.reply({ content: 'Team only.', ephemeral: true });
          const sub = it.options.getSubcommand(), d = db.get();
          if (sub === 'start') {
            if (d.contest) return it.reply({ content: `A contest is running already: **${d.contest.theme}**. End it first with /contest end.`, ephemeral: true });
            const theme = it.options.getString('theme'), days = it.options.getInteger('days') ?? 7, end = Date.now() + days * 86_400_000;
            const msg = await it.guild.channels.cache.get(C.memes).send({ embeds: [{ color: 0xF5B342, title: `🐐 MEEMEE’s meme contest: ${theme}`,
              description: `Post your meme **as an image** in this channel before <t:${Math.floor(end / 1000)}:F> (<t:${Math.floor(end / 1000)}:R>).\nVote for others with ${STAR}. Your own ${STAR} doesn’t count.\n\nPrizes: 🥇 +${PRIZES[0]} XP and a spotlight on X · 🥈 +${PRIZES[1]} XP · 🥉 +${PRIZES[2]} XP\n\nテーマ：${theme}　画像で投稿、${STAR} で投票！`,
              footer: { text: 'Images unlock at level 3 (Stray Cat).' } }] });
            d.contest = { theme, start: Date.now(), end, msg: msg.id, by: it.user.id }; db.set(d);
            return it.reply({ content: `Contest started in <#${C.memes}>.`, ephemeral: true });
          }
          if (sub === 'end') {
            if (!d.contest) return it.reply({ content: 'No contest is running.', ephemeral: true });
            await it.deferReply({ ephemeral: true });
            const top = await endContest(it.guild, it.user.id);
            return it.editReply(`Ended. ${top?.length ? `Winner: <@${top[0].author}>` : 'No votes.'}`);
          }
        }
      } catch (e) { ctx.log('meemee', it.commandName, e.message); if (it.deferred) it.editReply('Something went wrong, nya.').catch(() => {}); else if (!it.replied) it.reply({ content: 'Something went wrong, nya.', ephemeral: true }).catch(() => {}); }
    });

    return [
      new SlashCommandBuilder().setName('omikuji').setDescription('Draw today’s fortune slip from MEEMEE 🎋'),
      new SlashCommandBuilder().setName('contest').setDescription('Team: meme contests in #memes-art').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand((s) => s.setName('start').setDescription('Start a contest')
          .addStringOption((o) => o.setName('theme').setDescription('The theme').setRequired(true).setMaxLength(100))
          .addIntegerOption((o) => o.setName('days').setDescription('How long (default 7)').setMinValue(1).setMaxValue(14)))
        .addSubcommand((s) => s.setName('end').setDescription('End the contest now and pay the winners')),
    ];
  },
};
