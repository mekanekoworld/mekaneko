#!/usr/bin/env node
// MEKANEKO's Discord agents, all in one process so they share the level store: PYON (levels, #status), HACHI (welcome, /faq, #help),
// SHURU (scam watch, /check), KOKEKO (/x, /announce), MEEMEE (/omikuji, contests), RYUJIN (/agents, /ask soon). No AI calls yet.
//
// Env: DISCORD_TOKEN_PYON (required) and DISCORD_TOKEN_RYUJIN / _HACHI / _SHURU / _KOKEKO / _MEEMEE (each optional: no token, no bot),
// MK_DISCORD_IDS (ids.json from discord/setup.mjs), MK_DATA (data folder). Deploy: discord/bot/deploy.sh.
// Developer Portal intents: PYON → Message Content; HACHI and SHURU → Server Members.
import { Client, Events, REST, Routes, ActivityType } from 'discord.js';
import { makeCtx, log } from './common.mjs';

const ORDER = ['pyon', 'ryujin', 'hachi', 'shuru', 'kokeko', 'meemee'];   // PYON first: the others use it for XP and for reading messages
const ctx = makeCtx();

for (const name of ORDER) {
  const token = process.env[`DISCORD_TOKEN_${name.toUpperCase()}`];
  if (!token) { log(`${name.toUpperCase()}: no token, not started`); continue; }
  const agent = (await import(`./agents/${name}.mjs`)).default;
  const client = new Client({ intents: agent.intents, partials: agent.partials || [] });
  ctx.clients[name] = client;
  const commands = agent.setup(client, ctx).map((c) => c.toJSON());
  client.once(Events.ClientReady, async (c) => {
    try { await new REST().setToken(token).put(Routes.applicationGuildCommands(c.user.id, ctx.ids.guild), { body: commands }); }
    catch (e) { log(`${name.toUpperCase()} commands:`, e.message); }
    c.user.setPresence({ activities: [{ type: ActivityType.Custom, name: 'custom', state: agent.status }] });
    log(`${name.toUpperCase()} online as ${c.user.tag} (${commands.map((x) => '/' + x.name).join(' ') || 'no commands'})`);
  });
  client.on('error', (e) => log(name.toUpperCase(), 'error', e.message));
  try { await client.login(token); }
  catch (e) {
    log(`${name.toUpperCase()} login failed: ${/disallowed intents/i.test(e.message) ? 'turn on its privileged intent in the Developer Portal (Bot → Privileged Gateway Intents)' : e.message}`);
    delete ctx.clients[name]; client.destroy();
  }
}
if (!ctx.clients.pyon) log('PYON is not running: XP, level roles and message reading are off');

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { ctx.store.save(); } catch {} process.exit(0); });
process.on('unhandledRejection', (e) => log('unhandled:', e?.message || e));
