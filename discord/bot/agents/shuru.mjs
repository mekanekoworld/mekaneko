// SHURU 🐍 security: flags suspicious new accounts and look-alike names in #mod-log (humans decide), and /check reads a contract
// straight from Robinhood Chain + DexScreener. No AI: a plain-words verdict comes when SHURU's AI is live.
import { GatewayIntentBits as I, Events, SlashCommandBuilder } from 'discord.js';
import { nameFlags } from '../common.mjs';
import { TOOLS, CHAIN } from '../vendor/tools.mjs';

const DAY = 86_400_000, ADDR = /^0x[0-9a-fA-F]{40}$/;
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (n) => (n == null ? '-' : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);
const pct = (n) => (n == null ? '-' : `${n > 0 ? '+' : ''}${(+n).toFixed(1)}%`);
const age = (iso) => { if (!iso) return '-'; const h = (Date.now() - Date.parse(iso)) / 3_600_000; return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`; };

export default {
  intents: [I.Guilds, I.GuildMembers],        // Server Members Intent: joins and name changes
  status: 'Watching for scams · /check',
  setup(client, ctx) {
    const { C, R } = ctx;
    let staff = [];                            // names a scammer would copy: MEKANEKO, the agents, the team and moderators
    const refreshStaff = async () => {
      const guild = ctx.guild('shuru'); if (!guild) return;
      const members = await guild.members.fetch().catch(() => guild.members.cache);
      const team = members.filter((m) => !m.user.bot && (m.roles.cache.has(R.team) || m.roles.cache.has(R.mod) || m.id === guild.ownerId));
      staff = [['MEKANEKO', false], ['Meka-kun', true], ...['RYUJIN', 'SHURU', 'KOKEKO', 'MEEMEE'].map((n) => [n, true]), ['HACHI', false], ['PYON', false],
        ...team.flatMap((m) => [[m.user.username, true], [m.displayName, true]])];
    };
    client.once(Events.ClientReady, () => { refreshStaff(); setInterval(refreshStaff, 30 * 60_000); });

    const report = async (member, reasons, what) => {
      const ch = member.guild.channels.cache.get(C.modlog); if (!ch || !reasons.length) return;
      const strong = reasons.some((r) => /staff|close to|hours old/.test(r));
      await ch.send({ embeds: [{ color: strong ? 0xFF5A5A : 0xF5B342, title: `🐍 SHURU: ${what}`,
        description: `<@${member.id}> · \`${member.user.username}\` · ID ${member.id}\n\n${reasons.map((r) => `• ${r}`).join('\n')}`,
        footer: { text: 'SHURU only flags. A moderator decides: watch, timeout or ban.' }, timestamp: new Date().toISOString() }], allowedMentions: { parse: [] } })
        .catch((e) => ctx.log('shuru report', e.message));
    };
    const check = (member) => {
      if (member.user.bot || ctx.isTeam(member)) return [];
      const reasons = nameFlags([member.user.username, member.user.globalName, member.nickname], staff);
      const old = Date.now() - member.user.createdTimestamp;
      if (old < DAY) reasons.push(`account is ${Math.max(1, Math.round(old / 3_600_000))} hours old`);
      else if (old < 7 * DAY) reasons.push(`account is ${Math.round(old / DAY)} days old`);
      if (!member.user.avatar && reasons.length) reasons.push('no profile picture');
      return reasons;
    };
    client.on(Events.GuildMemberAdd, (m) => { if (m.guild.id === ctx.ids.guild) report(m, check(m), 'new member to watch'); });
    client.on(Events.GuildMemberUpdate, (before, after) => {
      if (after.guild.id !== ctx.ids.guild || (before.nickname === after.nickname && before.user.globalName === after.user.globalName)) return;
      const flags = nameFlags([after.nickname, after.user.globalName], staff);
      if (flags.length && !after.user.bot && !ctx.isTeam(after)) report(after, flags, 'changed their name');
    });

    // ---------- /check <address> ----------
    const last = new Map();
    client.on(Events.InteractionCreate, async (it) => {
      if (!it.isChatInputCommand() || it.commandName !== 'check' || it.guildId !== ctx.ids.guild) return;
      const a = (it.options.getString('address') || '').trim();
      if (!ADDR.test(a)) return it.reply({ content: 'That doesn’t look like a contract address (0x followed by 40 characters).', ephemeral: true });
      const wait = 30_000 - (Date.now() - (last.get(it.user.id) || 0));
      if (wait > 0) return it.reply({ content: `One check every 30 seconds, please. Try again in ${Math.ceil(wait / 1000)} s.`, ephemeral: true });
      last.set(it.user.id, Date.now());
      await it.deferReply();
      try {
        const [chain, market] = await Promise.all([TOOLS.token_onchain.run({ address: a }), TOOLS.market_token.run({ address: a }).catch(() => ({ found: false }))]);
        if (!chain.is_contract) return it.editReply(`🐍 \`${short(a)}\`: no contract code at this address on Robinhood Chain. It is a wallet, or the token lives on another chain.`);
        const p = market.found ? market.main_pair : null;
        const fields = [
          { name: 'Contract', value: `✅ ERC-20 · ${chain.total_supply != null ? Number(chain.total_supply).toLocaleString('en-US') : '?'} supply`, inline: false },
          { name: 'Owner', value: chain.ownership_renounced ? '✅ Renounced' : chain.owner ? `⚠️ Controlled by \`${short(chain.owner)}\`` : '❔ No owner() function', inline: true },
          { name: 'Burned', value: chain.burned_pct != null ? `${chain.burned_pct}%` : '-', inline: true },
          { name: 'Liquidity', value: p ? `${p.liquidity_usd < 50_000 ? '⚠️ ' : ''}${usd(p.liquidity_usd)}` : '⚠️ No DEX pair found', inline: true },
          ...(p ? [{ name: '24h', value: `${pct(p.change_24h_pct)} · vol ${usd(p.volume_24h_usd)} · ${p.buys_24h ?? '?'} buys / ${p.sells_24h ?? '?'} sells`, inline: false },
            { name: 'Pair age', value: `${/h$/.test(age(p.created)) ? '⚠️ ' : ''}${age(p.created)}`, inline: true }, { name: 'DEX', value: p.dex || '-', inline: true }] : []),
          { name: 'Links', value: `[Explorer](${CHAIN.explorer}/token/${a})${p?.url ? ` · [Chart](${p.url})` : ''}`, inline: false },
        ];
        await it.editReply({ embeds: [{ color: 0x2BD9A0, title: `🐍 SHURU check · ${chain.name || 'Unknown'} ($${chain.symbol || '?'})`, description: `\`${a}\` · Robinhood Chain`, fields,
          footer: { text: 'Not checked: holder spread, verified source code, taxes/honeypot. Look on the explorer before you buy. Not financial advice.' } }] });
      } catch (e) { ctx.log('shuru check', e.message); await it.editReply('🐍 The chain didn’t answer just now. Try again in a minute.').catch(() => {}); }
    });

    return [
      new SlashCommandBuilder().setName('check').setDescription('SHURU reads a token contract on Robinhood Chain')
        .addStringOption((o) => o.setName('address').setDescription('Contract address (0x…)').setRequired(true)),
    ];
  },
};
