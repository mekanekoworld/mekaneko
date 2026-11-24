// KOKEKO 🐔 news: /x posts a MEKANEKO post from X into #x-feed and pings @Raid; /announce writes an announcement (with @Announcements)
// and publishes it to every server that follows #announcements. Team only. No AI (the daily brief comes with the AI).
// Both also go to the MEKANEKO Telegram group (pinned for announcements) unless telegram:false; see ../telegram.mjs.
import { GatewayIntentBits as I, Events, SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { tgReady, tgPost, toTgHtml, esc as tgEsc } from '../telegram.mjs';
import { trendCard, omikujiCard } from '../market.mjs';
import { sentryEmbed, recapEmbed, watchfireEmbed } from '../sentry-post.mjs';

// The Record (graded in public on app.mekaneko.com/en/record/) lives in the agent API on this VPS: every Sentry post is sent there
// at once with the price read at the post, and the posts of the last 24 hours are re-sent every 5 minutes (the API skips known ones).
const API = process.env.MK_API_URL || 'http://127.0.0.1:8787';
async function toRecord(calls) {
  const r = await fetch(`${API}/api/record/calls`, { method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { 'content-type': 'application/json', 'x-mk-proxy': process.env.MK_PROXY_SECRET || '', 'x-mk-internal': 'kokeko' }, body: JSON.stringify({ calls }) });
  if (!r.ok) throw new Error(`record ${r.status}`);
}
async function priceAtPost(r) {
  const p = r.pons;
  if (!p || p.graduated || !(p.priceInPair > 0) || p.pair?.address !== 'native') return {};
  const eth = await (await import('../vendor/gate/market.mjs')).getEthUsd().catch(() => null);
  return eth ? { priceUsd: p.priceInPair * eth, priceSrc: 'pons-curve' } : {};
}

const X_POST = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/\w{1,15}\/status\/\d+/;

export default {
  intents: [I.Guilds],
  status: 'Cock-a-doodle news · /x',
  setup(client, ctx) {
    const { C, R } = ctx;
    const logTo = (guild, text) => guild.channels.cache.get(C.botctl)?.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
    // the Telegram copy: '' when it went out, otherwise a short reason for the reply
    const toTelegram = async (want, html, opts) => {
      if (!want) return ' (not sent to Telegram)';
      if (!tgReady()) return ' (Telegram is not set up on this server)';
      try { await tgPost(html, opts); return ''; } catch (e) { ctx.log('kokeko telegram', e.message); return ` (Telegram failed: ${e.message})`; }
    };

    // Market Omikuji (feedback 24 Nov): one fortune card a day in #daily-brief, drawn from real GeckoTerminal data, from 01:00 UTC
    // (08:00 WIB). The day last posted is kept in data/kokeko.json, so a restart never posts twice.
    const state = ctx.json('kokeko.json', { omikujiDay: '' });
    const omikuji = async () => {
      const now = new Date(), day = now.toISOString().slice(0, 10);
      if (now.getUTCHours() < 1 || state.get().omikujiDay === day) return;
      const ch = client.channels.cache.get(C.brief) || await client.channels.fetch(C.brief).catch(() => null);
      if (!ch) return;
      const card = await omikujiCard(now).catch((e) => { ctx.log('kokeko omikuji', e.message); return null; });
      if (!card) return;
      await ch.send({ embeds: [card], allowedMentions: { parse: [] } });
      state.set({ ...state.get(), omikujiDay: day }); ctx.log('kokeko', `market omikuji posted for ${day}`);
    };
    client.once(Events.ClientReady, () => { omikuji().catch(() => {}); setInterval(() => omikuji().catch(() => {}), 10 * 60_000); });

    // Sentry (ported from Troya Agent, MIT; vendor/gate/sentry.mjs): every new Pons launch goes through the Gate, and the ones
    // with real buying (0.5 ETH+ from 25+ independent wallets, no copies, no look-alike names) are posted. SENTRY=off stops it;
    // SENTRY_CHANNEL picks the channel key (default: daily-brief, where KOKEKO may post).
    if (process.env.SENTRY !== 'off') client.once(Events.ClientReady, async () => {
      let S;
      try { S = await import('../vendor/gate/sentry.mjs'); } catch (e) { ctx.log('kokeko sentry', `not started: ${e.message}`); return; }
      const st = ctx.json('sentry.json', {});
      const channel = async () => { const id = C[process.env.SENTRY_CHANNEL || 'brief']; return client.channels.cache.get(id) || client.channels.fetch(id).catch(() => null); };
      await S.start({
        store: { read: async (fb) => ({ ...fb, ...st.get() }), write: async (s) => st.set(s) },
        log: (...a) => ctx.log('sentry', ...a),
        recapUtcHour: 13,
        onPost: async (r) => {
          const ch = await channel(); if (!ch) throw new Error('channel not found');
          const msg = await ch.send({ allowedMentions: { parse: [] }, embeds: [sentryEmbed(r, S)] });
          const at = Date.now();
          priceAtPost(r).then((px) => toRecord([{ token: r.token, symbol: r.symbol || null, at, post: msg?.url || null, ...px }]))
            .catch((e) => ctx.log('kokeko record', e.message));
        },
        onRecap: async (d) => {
          const ch = await channel(); if (!ch) return;
          await ch.send({ allowedMentions: { parse: [] }, embeds: [recapEmbed(d, S)] });
        },
      });
      ctx.log('kokeko', `sentry watching Pons launches -> #${process.env.SENTRY_CHANNEL || 'brief'}`);
      const sync = () => {
        const s = st.get() || {}, sym = Object.fromEntries((s.recent || []).map((x) => [String(x.token).toLowerCase(), x.symbol || null]));
        const calls = Object.entries(s.posted || {}).map(([token, at]) => ({ token, symbol: sym[token] || null, at: Number(at) }));
        if (calls.length) toRecord(calls).catch((e) => ctx.log('kokeko record sync', e.message));
      };
      setTimeout(sync, 30_000); setInterval(sync, 5 * 60_000);
      // Watchfire runs in the agent API (it watches the coins above for 24 hours, and $MEKANEKO): its alerts are posted here
      const wf = ctx.json('watchfire.json', {});
      if (!wf.get().since) wf.set({ since: Date.now() });                     // first start: no back-posting of older alerts
      let wfBusy = false;
      const wfPoll = async () => {
        if (wfBusy || process.env.WATCHFIRE === 'off') return;
        wfBusy = true;
        try {
          const r = await fetch(`${API}/api/watchfire/alerts?since=${wf.get().since || 0}`, { signal: AbortSignal.timeout(15_000), headers: { 'x-mk-proxy': process.env.MK_PROXY_SECRET || '' } });
          if (!r.ok) return;
          const list = ((await r.json()).alerts || []).sort((a, b) => a.at - b.at);
          for (const a of list) {
            if (!a.receipt && Date.now() - a.at < 20_000) break;               // give the Seal a moment to sign it; the next round posts it
            const ch = await channel(); if (!ch) break;
            await ch.send({ allowedMentions: { parse: [] }, embeds: [watchfireEmbed(a)] });
            wf.set({ since: a.at });
            ctx.log('kokeko', `watchfire ${a.kind} $${a.symbol || '?'} posted`);
          }
        } catch (e) { ctx.log('kokeko watchfire', e.message); }
        finally { wfBusy = false; }
      };
      setInterval(wfPoll, 20_000);
    });

    client.on(Events.InteractionCreate, async (it) => {
      if (it.guildId !== ctx.ids.guild) return;
      try {
        if (it.isChatInputCommand() && it.commandName === 'trend') {      // NEZU's trend card, no AI (anyone)
          await it.deferReply();
          return it.editReply({ embeds: [await trendCard(3)], allowedMentions: { parse: [] } });
        }
        if (it.isChatInputCommand() && it.commandName === 'x') {
          if (!ctx.isTeam(it.member)) return it.reply({ content: 'Team only.', ephemeral: true });
          const link = (it.options.getString('link') || '').trim(), note = it.options.getString('note'), raid = it.options.getBoolean('raid') ?? true;
          const tg = it.options.getBoolean('telegram') ?? true;
          if (!X_POST.test(link)) return it.reply({ content: 'Paste the link of one post on X (x.com/…/status/…).', ephemeral: true });
          await it.deferReply({ ephemeral: true });                   // Discord wants an answer within 3 s; two posts can take longer
          const ch = it.guild.channels.cache.get(C.xfeed);
          await ch.send({ content: `${raid ? `<@&${R.pingRaid}> ` : ''}🐔 ${note || 'New post from MEKANEKO on X. Like, repost, reply!'}\n${link.replace('twitter.com', 'x.com')}`,
            allowedMentions: { roles: raid ? [R.pingRaid] : [] } });
          const x = link.replace('twitter.com', 'x.com');
          const tgNote = await toTelegram(tg, `🐔 ${tgEsc(note || 'New post from MEKANEKO on X. Like, repost, reply!')}\n${tgEsc(x)}`, { preview: true });
          logTo(it.guild, `🐔 <@${it.user.id}> posted to <#${C.xfeed}>${raid ? ' with a raid ping' : ''}${tg && !tgNote ? ' and the Telegram group' : ''}: ${link}`);
          return it.editReply(`Posted in <#${C.xfeed}>${raid ? ' and pinged @Raid' : ''}${tgNote || ', and in the Telegram group'}.`);
        }
        if (it.isChatInputCommand() && it.commandName === 'announce') {
          if (!ctx.isTeam(it.member)) return it.reply({ content: 'Team only.', ephemeral: true });
          const ping = it.options.getBoolean('ping') ?? true, tg = it.options.getBoolean('telegram') ?? true;
          const m = new ModalBuilder().setCustomId(`kokeko-announce:${ping ? 1 : 0}:${tg ? 1 : 0}`).setTitle('Announcement').addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('body').setLabel('Message (English, 日本語 below if you like)').setStyle(TextInputStyle.Paragraph).setMaxLength(3800).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image').setLabel('Image link (optional, https://…)').setStyle(TextInputStyle.Short).setRequired(false)));
          return it.showModal(m);
        }
        if (it.isModalSubmit() && it.customId.startsWith('kokeko-announce:')) {
          if (!ctx.isTeam(it.member)) return it.reply({ content: 'Team only.', ephemeral: true });
          const [, p, t] = it.customId.split(':'), ping = p === '1', tg = t !== '0', image = it.fields.getTextInputValue('image').trim();
          const title = it.fields.getTextInputValue('title'), body = it.fields.getTextInputValue('body');
          await it.deferReply({ ephemeral: true });
          const ch = it.guild.channels.cache.get(C.announcements);
          const msg = await ch.send({ content: ping ? `<@&${R.pingAnn}>` : undefined, allowedMentions: { roles: ping ? [R.pingAnn] : [] },
            embeds: [{ color: 0xFF5A3C, title, description: body,
              ...(/^https:\/\/\S+$/.test(image) ? { image: { url: image } } : {}), footer: { text: 'KOKEKO · MEKANEKO news' }, timestamp: new Date().toISOString() }] });
          await msg.crosspost().catch(() => {});                       // reaches servers that follow #announcements
          const tgNote = await toTelegram(tg, `📣 <b>${tgEsc(title)}</b>\n\n${toTgHtml(body)}\n\n<i>KOKEKO · MEKANEKO news</i>`, { image: /^https:\/\/\S+$/.test(image) ? image : undefined, pin: true });
          logTo(it.guild, `🐔 <@${it.user.id}> announced: **${title}** ${msg.url}${tg && !tgNote ? ' (also in the Telegram group)' : ''}`);
          return it.editReply(`Announced in <#${C.announcements}>${tgNote || ', and pinned in the Telegram group'}.`);
        }
      } catch (e) { ctx.log('kokeko', e.message); const t = 'Something went wrong. Check my permissions in that channel.'; if (it.deferred) it.editReply(t).catch(() => {}); else if (it.isRepliable() && !it.replied) it.reply({ content: t, ephemeral: true }).catch(() => {}); }
    });

    return [
      new SlashCommandBuilder().setName('trend').setDescription("NEZU's top 3 trending pools on Robinhood Chain right now"),
      new SlashCommandBuilder().setName('x').setDescription('Team: share a MEKANEKO post from X in #x-feed').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption((o) => o.setName('link').setDescription('Link to the post on X').setRequired(true))
        .addStringOption((o) => o.setName('note').setDescription('One line above the link (optional)'))
        .addBooleanOption((o) => o.setName('raid').setDescription('Ping @Raid (default: yes)'))
        .addBooleanOption((o) => o.setName('telegram').setDescription('Also post in the Telegram group (default: yes)')),
      new SlashCommandBuilder().setName('announce').setDescription('Team: post an announcement in #announcements').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addBooleanOption((o) => o.setName('ping').setDescription('Ping @Announcements (default: yes)'))
        .addBooleanOption((o) => o.setName('telegram').setDescription('Also post and pin in the Telegram group (default: yes)')),
    ];
  },
};
