#!/usr/bin/env node
// MEKANEKO's Telegram agents, all in one process so they share the level store: SHURU (captcha, scam filter, /check),
// HACHI (welcomes, /faq, /links, /rules), PYON (levels), KOKEKO (/announce, /x), MEEMEE (/omikuji, contests), RYUJIN (/agents, /ask soon).
// No AI calls yet. Long polling only: the VPS needs no open port.
//
// Env: TELEGRAM_TOKEN_SHURU / _HACHI / _PYON / _KOKEKO / _MEEMEE / _RYUJIN (each optional: no token, no bot),
//      TELEGRAM_CHAT_ID (the MEKANEKO group; until it is set the bots only log the groups they are in),
//      TELEGRAM_CHANNEL_ID (the MEKANEKO channel: KOKEKO posts there; the group is the channel's discussion chat),
//      TELEGRAM_MODLOG_CHAT (optional private chat for SHURU's notes), MK_DATA (data folder). Deploy: telegram/bot/deploy.sh.
// Every bot is an admin in the group (that is how it sees members' messages and commands); rights per bot in telegram/SETUP.md.
import { Bot } from 'grammy';
import { makeCtx, log, L, reply } from './tg.mjs';
import { LINKS } from './rules.mjs';

const ORDER = ['pyon', 'shuru', 'hachi', 'kokeko', 'meemee', 'ryujin'];
const ctx = makeCtx(), apiRoot = process.env.TG_API_ROOT;      // TG_API_ROOT: tests only (a fake Bot API)
if (!ctx.chatId) log(`TELEGRAM_CHAT_ID is not set: no group features${ctx.channelId ? ' (channel only: KOKEKO posts announcements)' : ''}; the bots answer DMs and log the groups they are in`);

const started = [];
for (const name of ORDER) {
  const NAME = name.toUpperCase(), token = process.env[`TELEGRAM_TOKEN_${NAME}`];
  if (!token) { log(`${NAME}: no token, not started`); continue; }
  const agent = (await import(`./agents/${name}.mjs`)).default;
  const bot = new Bot(token, apiRoot ? { client: { apiRoot } } : {});
  bot.use(ctx.guard(NAME));

  // DMs: the agents never DM first; when someone writes to one, it introduces itself and points to the group
  const dmOk = new Set(agent.commands.filter((x) => x.dm || x.dmAllow).map((x) => x.command));   // dmAllow: works in DMs, not in the DM menu
  bot.chatType('private').on('message', (c, next) => {
    const cmd = (c.msg.text || '').match(/^\/(\w+)/)?.[1];
    if (cmd && dmOk.has(cmd)) return next();
    return reply(c, `${L(c.from, agent.intro[0], agent.intro[1])}${LINKS.telegramUrl ? `\n\n✈️ ${LINKS.telegramUrl}` : ''}`);
  });
  agent.setup(bot, ctx);
  bot.catch((e) => log(NAME, 'error', e.error?.description || e.error?.message || e.message));

  try { await bot.init(); }
  catch (e) { log(`${NAME} login failed: ${e.description || e.message}`); continue; }
  ctx.bots[name] = bot;

  // command menus: members see the public ones, admins also the team ones; Japanese clients get Japanese descriptions
  const pub = agent.commands.filter((x) => !x.admin), dm = agent.commands.filter((x) => x.dm);
  const list = (xs, ja) => xs.map((x) => ({ command: x.command, description: ja ? x.ja : x.en }));
  for (const ja of [false, true]) {
    const lang = ja ? { language_code: 'ja' } : {};
    await bot.api.setMyCommands(list(pub, ja), { scope: { type: 'all_group_chats' }, ...lang }).catch((e) => log(NAME, 'commands', e.description || e.message));
    await bot.api.setMyCommands(list(agent.commands, ja), { scope: { type: 'all_chat_administrators' }, ...lang }).catch(() => {});
    await bot.api.setMyCommands(list(dm, ja), { scope: { type: 'all_private_chats' }, ...lang }).catch(() => {});
  }
  started.push([NAME, bot, agent]);
}

for (const [NAME, bot, agent] of started)
  bot.start({ allowed_updates: agent.updates, onStart: (me) => log(`${NAME} online as @${me.username} (${agent.commands.map((x) => '/' + x.command).join(' ')})`) })
    .catch((e) => log(NAME, 'stopped:', e.description || e.message));
ctx.events.emit('ready');
if (!ctx.bots.shuru) log('SHURU is not running: no captcha and no scam filter in the group');

setInterval(() => { try { ctx.store.save(); } catch (e) { log('save', e.message); } }, 30_000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
  try { ctx.store.save(); } catch {}
  await Promise.allSettled(started.map(([, b]) => b.stop()));
  process.exit(0);
});
process.on('unhandledRejection', (e) => log('unhandled:', e?.description || e?.message || e));
