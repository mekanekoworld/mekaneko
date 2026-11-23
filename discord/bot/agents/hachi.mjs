// HACHI 🐶 support: welcomes new members (in small batches, in #general), /faq, and a first reply to every new #help post. No AI.
import { GatewayIntentBits as I, Events, SlashCommandBuilder } from 'discord.js';
import { FAQ, suggest } from '../content.mjs';

const BATCH = 5, EVERY = 5 * 60_000;   // AutoMod blocks messages with more than 5 mentions

export default {
  intents: [I.Guilds, I.GuildMembers],        // Server Members Intent: needed to see who joins
  status: 'Here to help · /faq',
  setup(client, ctx) {
    const { C, R } = ctx;
    const isJa = (member) => member?.roles?.cache?.has(R.ja);
    const answer = (key, ja) => { const f = FAQ[key]; return `**${f.q[ja ? 1 : 0]}**\n${ja ? f.ja : f.en}`; };
    const linkify = (s, guild) => s.replace(/#(official-links|report-scam|help|neon-lounge|rules|日本語)/g, (m, name) => {
      const ch = guild?.channels.cache.find((c) => c.name === name); return ch ? `<#${ch.id}>` : m; });

    // ---------- welcome: a few new members per message, every 5 minutes ----------
    const queue = [];
    client.on(Events.GuildMemberAdd, (m) => { if (m.guild.id === ctx.ids.guild && !m.user.bot) queue.push(m.id); });
    setInterval(async () => {
      const guild = ctx.guild('hachi'); const ch = guild?.channels.cache.get(C.general); if (!ch || !queue.length) return;
      while (queue.length) {
        const ids = [...new Set(queue.splice(0, BATCH))].filter((id) => guild.members.cache.has(id));
        if (!ids.length) continue;
        await ch.send({ content: `🐾 Welcome to MEKANEKO World, ${ids.map((id) => `<@${id}>`).join(' ')}! Start with <#${C.rules}>, trust only <#${C.links}>, and ask anything in <#${C.help}>. Say GM nya to start your streak.\n日本語のチャットは <#${C.ja}> へ。ようこそ！`,
          allowedMentions: { users: ids } }).catch((e) => ctx.log('hachi welcome', e.message));
      }
    }, EVERY);

    // ---------- a first answer on every new #help post ----------
    client.on(Events.ThreadCreate, async (thread, isNew) => {
      try {
        if (!isNew || thread.parentId !== C.help) return;
        await new Promise((r) => setTimeout(r, 3000));
        const starter = await (await ctx.read(thread.id)).fetchStarterMessage().catch(() => null);   // PYON reads (Message Content intent)
        const text = `${thread.name}\n${starter?.content || ''}`, ja = /[぀-ヿ一-龯]/.test(text);
        const keys = suggest(text);
        const lines = [ja ? 'HACHI です 🐶 投稿ありがとう！チームがここで返信します。' : 'HACHI here 🐶 thanks for posting! A human from the team will reply right here.'];
        if (keys.length) lines.push('', ja ? 'その間、これが役立つかも:' : 'Meanwhile, this might help:', '', ...keys.map((k) => answer(k, ja)));
        lines.push('', ja ? '⚠️ シードフレーズや秘密鍵は絶対に載せないで。チームから先にDMすることはありません。' : '⚠️ Never post your seed phrase or private key. The team never DMs first.');
        await thread.send({ content: linkify(lines.join('\n'), thread.guild).slice(0, 1990), allowedMentions: { parse: [] } });
      } catch (e) { ctx.log('hachi help', e.message); }
    });

    client.on(Events.InteractionCreate, async (it) => {
      if (!it.isChatInputCommand() || it.commandName !== 'faq' || it.guildId !== ctx.ids.guild) return;
      const key = it.options.getString('topic'), lang = it.options.getString('lang');
      const ja = lang ? lang === 'ja' : isJa(it.member);
      await it.reply({ content: linkify(answer(key, ja), it.guild), allowedMentions: { parse: [] } }).catch((e) => ctx.log('hachi faq', e.message));
    });

    return [
      new SlashCommandBuilder().setName('faq').setDescription('Quick answers from HACHI')
        .addStringOption((o) => o.setName('topic').setDescription('What about?').setRequired(true).addChoices(...Object.entries(FAQ).map(([k, f]) => ({ name: f.q[0], value: k }))))
        .addStringOption((o) => o.setName('lang').setDescription('Language').addChoices({ name: 'English', value: 'en' }, { name: '日本語', value: 'ja' })),
    ];
  },
};
