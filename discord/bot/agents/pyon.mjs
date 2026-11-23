// PYON 🐰 automation: levels (XP, level roles, /rank, /leaderboard, /award) and #status (website checks). No AI.
import { GatewayIntentBits as I, Partials, Events, SlashCommandBuilder, PermissionFlagsBits, MessageType, ChannelType } from 'discord.js';
import * as LV from '../levels.mjs';

const COLORS = { lvl3: 0xB9BBC6, lvl10: 0xE46A14, lvl20: 0x7CFF4F, lvl30: 0x14C9FF, lvl50: 0xFFD54A };
const SITES = [['MEKANEKO World', 'https://mekaneko.com'], ['Dashboard', 'https://app.mekaneko.com']];
const bar = (into, next, n = 14) => { const k = Math.round((into / next) * n); return '▰'.repeat(k) + '▱'.repeat(n - k); };

export default {
  intents: [I.Guilds, I.GuildMessages, I.MessageContent, I.GuildMessageReactions, I.GuildVoiceStates],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  status: 'GM nya! · /rank',
  setup(client, ctx) {
    const { C, R, store } = ctx;
    const NO_XP = new Set([C.reports, C.modlog, C.botctl, C.team, C.updates, C.levelups].filter(Boolean));
    const GM = new Set([C.general, C.ja]);
    const earnsXP = (ch) => {
      if (!ch || (ch.isThread() && ch.type === ChannelType.PrivateThread)) return false;
      const base = ch.isThread() ? ch.parent : ch;
      return !!base && !NO_XP.has(base.id) && base.parentId !== C.catTeam;
    };

    client.on(Events.MessageCreate, async (msg) => {
      try {
        if (msg.guildId !== ctx.ids.guild) return;
        if (msg.channelId === C.modlog && msg.type === MessageType.AutoModerationAction) {
          if (!msg.author.bot) await ctx.grant(msg.author.id, -LV.RULES.automodPenalty, 'AutoMod'); return;
        }
        if (msg.author.bot || msg.webhookId || msg.system || !earnsXP(msg.channel)) return;
        const u = store.user(msg.author.id), text = msg.content || '';
        let xp = LV.onMessage(u, text); store.dirty = true;
        if (GM.has(msg.channelId) && LV.isGM(text)) {
          const g = LV.onGM(u);
          if (g) {
            xp += g.xp; msg.react(msg.guild.emojis.cache.find((e) => e.name === 'mk_gm_nya') || '☀️').catch(() => {});
            if (LV.RULES.gm.streakBonus[g.streak]) msg.reply({ content: `🔥 ${g.streak}-day GM streak! +${g.xp} XP`, allowedMentions: { repliedUser: false } }).catch(() => {});
          }
        }
        await ctx.grant(msg.author.id, xp);
      } catch (e) { ctx.log('pyon message', e.message); }
    });

    client.on(Events.MessageReactionAdd, async (reaction, user) => {
      try {
        if (user.bot) return;
        const msg = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
        if (msg.channelId !== C.memes || !msg.author || msg.author.bot || !msg.attachments.size || store.d.memes[msg.id]) return;
        if ([...msg.reactions.cache.values()].reduce((a, r) => a + r.count, 0) < LV.RULES.meme.reactors) return;
        const fans = new Set();
        for (const r of msg.reactions.cache.values()) (await r.users.fetch()).forEach((x) => { if (!x.bot && x.id !== msg.author.id) fans.add(x.id); });
        if (fans.size < LV.RULES.meme.reactors) return;
        store.d.memes[msg.id] = Date.now(); store.dirty = true;
        await ctx.grant(msg.author.id, LV.RULES.meme.xp, 'meme');
      } catch (e) { ctx.log('pyon reaction', e.message); }
    });

    setInterval(async () => {                                         // Town Hall XP while a stage is live
      const guild = ctx.guild(); if (!guild) return;
      for (const stage of guild.stageInstances.cache.values())
        for (const m of guild.channels.cache.get(stage.channelId)?.members?.values() || [])
          if (!m.user.bot) await ctx.grant(m.id, LV.onVoiceTick(store.user(m.id)), 'Town Hall');
    }, LV.RULES.voice.everyMs);

    // #status: a site counts as down after two failed checks in a row (5 minutes apart), and as up again on the first good one
    const st = ctx.json('status.json', {});
    setInterval(async () => {
      const guild = ctx.guild(); const ch = guild?.channels.cache.get(C.status); if (!ch) return;
      const s = st.get();
      for (const [name, url] of SITES) {
        let ok = false, why = '';
        try { const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15_000) }); ok = r.ok; why = `HTTP ${r.status}`; }
        catch (e) { why = e.name === 'TimeoutError' ? 'no answer in 15 s' : 'unreachable'; }
        const cur = s[url] ||= { up: true, fails: 0, since: Date.now() };
        if (ok) {
          if (!cur.up) { await ch.send(`🟢 **${name}** is back up after ${Math.max(1, Math.round((Date.now() - cur.since) / 60000))} min. ${url}`).catch(() => {}); cur.up = true; cur.since = Date.now(); }
          cur.fails = 0;
        } else if (++cur.fails === 2 && cur.up) {
          cur.up = false; cur.since = Date.now();
          await ch.send(`🔴 **${name}** is down (${why}). The team is on it. ${url}`).catch(() => {});
        }
      }
      st.set(s);
    }, 5 * 60_000);

    client.on(Events.InteractionCreate, async (it) => {
      if (!it.isChatInputCommand() || it.guildId !== ctx.ids.guild) return;
      try {
        if (it.commandName === 'rank') {
          const who = it.options.getUser('user') || it.user, u = store.user(who.id), lv = LV.levelOf(u.xp), m = LV.milestoneFor(lv.level);
          const nextM = LV.MILESTONES.find(([l]) => l > lv.level);
          return it.reply({ embeds: [{ color: m ? COLORS[m[1]] : 0x35D7FF, author: { name: who.displayName || who.username, icon_url: who.displayAvatarURL() },
            title: `Level ${lv.level}${m ? ` · ${m[2]}` : ''}`, description: `${bar(lv.into, lv.next)}  ${lv.into.toLocaleString()} / ${lv.next.toLocaleString()} XP`,
            fields: [{ name: 'Total XP', value: u.xp.toLocaleString(), inline: true }, { name: 'Rank', value: u.xp ? `#${store.rank(who.id)}` : '-', inline: true },
              { name: 'GM streak', value: u.streak ? `${u.streak} day${u.streak > 1 ? 's' : ''}` : '-', inline: true },
              ...(nextM ? [{ name: 'Next', value: `Level ${nextM[0]}: **${nextM[2]}**. ${nextM[3]}` }] : [])] }] });
        }
        if (it.commandName === 'leaderboard') {
          const top = store.top(10), medal = ['🥇', '🥈', '🥉'];
          return it.reply({ embeds: [{ color: 0xFFD54A, title: 'MEKANEKO leaderboard',
            description: top.length ? top.map(([id, u], i) => `${medal[i] || `**${i + 1}.**`} <@${id}> · Lv ${LV.levelOf(u.xp).level} · ${u.xp.toLocaleString()} XP`).join('\n') : 'No XP yet. Say GM nya!',
            footer: { text: 'Chat, GM every day, share memes, join Town Hall · /rank' } }], allowedMentions: { parse: [] } });
        }
        if (it.commandName === 'award') {
          if (!ctx.isTeam(it.member)) return it.reply({ content: 'Team and moderators only.', ephemeral: true });
          const who = it.options.getUser('user'), kind = it.options.getString('for'), amount = kind === 'custom' ? it.options.getInteger('amount') : LV.RULES.award[kind];
          if (!amount) return it.reply({ content: 'Pick an amount for "Custom amount".', ephemeral: true });
          if (who.bot) return it.reply({ content: 'Bots don’t level up.', ephemeral: true });
          await ctx.grant(who.id, amount, `award ${kind} by ${it.user.id}`);
          it.guild.channels.cache.get(C.botctl)?.send({ content: `🏅 <@${it.user.id}> gave <@${who.id}> ${amount > 0 ? '+' : ''}${amount} XP (${kind}).`, allowedMentions: { parse: [] } }).catch(() => {});
          return it.reply({ content: `${amount > 0 ? '+' : ''}${amount} XP for <@${who.id}>. They have ${store.user(who.id).xp.toLocaleString()} XP now.`, ephemeral: true, allowedMentions: { parse: [] } });
        }
      } catch (e) { ctx.log('pyon command', it.commandName, e.message); if (!it.replied) it.reply({ content: 'Something went wrong, nya. Try again in a moment.', ephemeral: true }).catch(() => {}); }
    });

    setInterval(() => { try { store.save(); } catch (e) { ctx.log('save', e.message); } }, 30_000);

    return [
      new SlashCommandBuilder().setName('rank').setDescription('Your MEKANEKO level (or someone else’s)').addUserOption((o) => o.setName('user').setDescription('Whose level')),
      new SlashCommandBuilder().setName('leaderboard').setDescription('The top 10 cats'),
      new SlashCommandBuilder().setName('award').setDescription('Team: give or take XP').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
        .addStringOption((o) => o.setName('for').setDescription('What for').setRequired(true).addChoices(
          { name: `Solved a #help question (+${LV.RULES.award.solved})`, value: 'solved' }, { name: `Bug report accepted (+${LV.RULES.award.bug})`, value: 'bug' },
          { name: `Contest win (+${LV.RULES.award.contest})`, value: 'contest' }, { name: 'Custom amount', value: 'custom' }))
        .addIntegerOption((o) => o.setName('amount').setDescription('For "Custom amount" (negative takes XP away)').setMinValue(-5000).setMaxValue(5000)),
    ];
  },
};
