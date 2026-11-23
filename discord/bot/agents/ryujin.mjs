// RYUJIN 🐉 commander: /agents shows the fifteen and where each one works; /ask sends the question to the MEKANEKO agents API on
// this VPS (mekaneko-api, 127.0.0.1:8787), where RYUJIN routes it to the right agent. Limits live in the API: 5 questions a day per
// member (10 from level 10) and one daily budget for everyone. The answer streams into the reply as it is written.
import { GatewayIntentBits as I, Events, SlashCommandBuilder } from 'discord.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as LV from '../levels.mjs';

const ICON = { RYUJIN: '🐉', NEZU: '🐭', KONKON: '🦊', SHURU: '🐍', NISHIKI: '🐟', CHOTOTSU: '🐗', MEEMEE: '🐐', KOKEKO: '🐔', PYON: '🐰',
  KAERU: '🐸', TORAMARU: '🐯', GYUDON: '🐮', HACHI: '🐶', UKKI: '🐵', HAYATE: '🐴' };
const HERE = { RYUJIN: '/agents · /ask', HACHI: '/faq · welcomes · #help', SHURU: '/check · scam watch', KOKEKO: '/trend · #announcements · #x-feed · #daily-brief',
  MEEMEE: '/omikuji · meme contests', PYON: '/rank · levels · #status' };
const VIA_ASK = ['NEZU', 'GYUDON', 'NISHIKI', 'HAYATE'], TEAM = ['CHOTOTSU', 'KONKON', 'UKKI'], WEB = ['KAERU', 'TORAMARU'];

const API = process.env.MK_API_URL || 'http://127.0.0.1:8787';
export const askLimit = (level) => (level >= 10 ? 10 : 5);
const LIMIT_MS = 4 * 60_000, EDIT_EVERY = 2500, PART = 1900, MAX_PARTS = 4;
const NONE = { parse: [] };                                                    // answers never ping anyone

// split a long answer at paragraph or line breaks into Discord-sized parts
export function parts(text, size = PART) {
  const out = []; let rest = text.trim();
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n\n', size); if (cut < size * 0.5) cut = rest.lastIndexOf('\n', size); if (cut < size * 0.5) cut = rest.lastIndexOf(' ', size);
    if (cut < size * 0.5) cut = size;
    out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// read the API's Server-Sent Events: text pieces, tool steps, done (questions left) or error
export async function streamAnswer(res, on) {
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.+)$/m.exec(block)?.[1]; let data = {};
      try { data = JSON.parse(/^data: (.+)$/m.exec(block)?.[1] || '{}'); } catch {}
      if (ev) await on(ev, data);
    }
  }
}

const step = (t) => (t.name === 'ask_agent' ? `asking ${t.label || 'an agent'}` : t.name === 'web_search' ? 'searching the web'
  : t.name === 'web_fetch' ? 'reading a page' : t.name.replace(/_/g, ' '));

async function ask(it, ctx) {
  const question = it.options.getString('question', true).trim().slice(0, 1500);
  const ja = /^ja/.test(it.locale || '');
  await it.deferReply();
  const level = LV.levelOf(ctx.store.user(it.user.id).xp).level;
  let res;
  try {
    res = await fetch(`${API}/api/agents/chat`, { method: 'POST', signal: AbortSignal.timeout(LIMIT_MS),
      headers: { 'content-type': 'application/json', 'x-mk-proxy': process.env.MK_PROXY_SECRET || '', 'x-mk-user': `discord:${it.user.id}`,
        'x-mk-limit': String(askLimit(level)) },
      body: JSON.stringify({ agent: 'ryujin', message: question, lang: ja ? 'ja' : 'en' }) });
  } catch (e) {
    ctx.log('ryujin ask', e.message);
    return it.editReply({ content: '🐉 My brain is not reachable right now. Try again in a few minutes.', allowedMentions: NONE });
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return it.editReply({ content: `🐉 ${j.error || `Something went wrong (HTTP ${res.status}). Try again later.`}`, allowedMentions: NONE });
  }
  const head = `> ${question.replace(/\n+/g, ' ').slice(0, 300)}\n`;
  let text = '', steps = [], left = null, limit = null, error = null, last = 0;
  const progress = () => {
    const doing = steps.length ? ` (${[...new Set(steps)].slice(-3).join(', ')})` : '';
    const body = text ? `${text.slice(-1500)}\n\n-# 🐉 still writing${doing}…` : `🐉 Thinking${doing}…`;
    return { content: head + body, allowedMentions: NONE };
  };
  try {
    await streamAnswer(res, async (ev, d) => {
      if (ev === 'text') text += d.d || '';
      else if (ev === 'tool' && d.state === 'start') steps.push(step(d));
      else if (ev === 'done') { left = d.left; limit = d.limit; }
      else if (ev === 'error') error = d.message;
      if (Date.now() - last > EDIT_EVERY) { last = Date.now(); await it.editReply(progress()).catch(() => {}); }
    });
  } catch (e) { error = error || e.message; ctx.log('ryujin stream', e.message); }

  if (!text.trim()) return it.editReply({ content: `${head}🐉 ${error || 'I could not find an answer this time. Try asking another way.'}`, allowedMentions: NONE });
  const foot = `\n\n-# ${left != null ? `${left} of ${limit} free questions left today · ` : ''}AI answers can be wrong. Not financial advice. Never share your seed phrase.`
    + (error ? `\n-# (stopped early: ${error})` : '');
  const all = parts(text);
  const shown = all.slice(0, MAX_PARTS);
  if (all.length > MAX_PARTS) shown[MAX_PARTS - 1] += '\n\n… (the answer was too long for Discord; ask a narrower question for the rest)';
  shown[shown.length - 1] += foot;
  await it.editReply({ content: head + shown[0], allowedMentions: NONE });
  for (const p of shown.slice(1)) await it.followUp({ content: p, allowedMentions: NONE });
}

export default {
  intents: [I.Guilds],
  status: 'Commanding the zodiac · /ask',
  setup(client, ctx) {
    let profiles = {};
    try { profiles = JSON.parse(readFileSync(process.env.MK_AGENT_PROFILES || fileURLToPath(new URL('../vendor/agents-profile.json', import.meta.url)), 'utf8')).agents || {}; } catch {}
    const role = (n) => profiles[n]?.role_en || '';
    const line = (n, extra) => `${ICON[n] || '•'} **${n}** · ${role(n)}${extra ? ` · ${extra}` : ''}`;

    client.on(Events.InteractionCreate, async (it) => {
      if (!it.isChatInputCommand() || it.guildId !== ctx.ids.guild) return;
      try {
        if (it.commandName === 'agents') return it.reply({ embeds: [{ color: 0xE5383B, title: '🐉 The MEKANEKO zodiac: fifteen agents, one job each',
          fields: [
            { name: 'In this server', value: Object.keys(HERE).map((n) => line(n, HERE[n])).join('\n') },
            { name: 'Through RYUJIN’s /ask (5 free questions a day, 10 from level 10)', value: VIA_ASK.map((n) => line(n)).join('\n') },
            { name: 'Team only', value: TEAM.map((n) => line(n)).join('\n') },
            { name: 'On the website: app.mekaneko.com', value: WEB.map((n) => line(n)).join('\n') },
          ], footer: { text: 'Long ago, the cat missed the zodiac race. So the cat built a new one.' } }] });
        if (it.commandName === 'ask') return await ask(it, ctx);
      } catch (e) {
        ctx.log('ryujin', e.message);
        if (it.deferred) await it.editReply({ content: '🐉 Something went wrong. Try again in a minute.', allowedMentions: NONE }).catch(() => {});
      }
    });

    return [
      new SlashCommandBuilder().setName('agents').setDescription('Meet the fifteen MEKANEKO agents'),
      new SlashCommandBuilder().setName('ask').setDescription('Ask the MEKANEKO agents (5 free questions a day)')
        .addStringOption((o) => o.setName('question').setDescription('Your question').setRequired(true).setMaxLength(1500)),
    ];
  },
};
