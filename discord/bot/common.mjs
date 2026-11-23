// Shared by every agent in this process: ids, the level store, XP grants, team checks, small JSON stores, and SHURU's name checks.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as LV from './levels.mjs';

export const log = (...a) => console.log(new Date().toISOString(), ...a);

export function makeCtx() {
  const ids = JSON.parse(readFileSync(process.env.MK_DISCORD_IDS || fileURLToPath(new URL('./ids.json', import.meta.url)), 'utf8'));
  const dataDir = process.env.MK_DATA || fileURLToPath(new URL('./data', import.meta.url));
  const ctx = { ids, C: ids.channels, R: ids.roles, dataDir, store: new LV.Store(dataDir), clients: {}, log };
  ctx.guild = (name = 'pyon') => ctx.clients[name]?.guilds.cache.get(ids.guild) || null;
  ctx.isTeam = (member) => !!member && (member.roles.cache.has(ctx.R.team) || member.roles.cache.has(ctx.R.mod) || member.id === ctx.guild()?.ownerId);
  ctx.json = (name, fallback) => jsonStore(join(dataDir, name), fallback);
  // XP goes through PYON, who owns the level roles and #level-ups
  ctx.grant = async (id, amount, why) => {
    if (!amount) return;
    const r = ctx.store.add(id, amount);
    if (why) log(`${amount > 0 ? '+' : ''}${amount} ${id} (${why}) -> ${r.xp} XP, level ${r.after}`);
    if (r.after !== r.before) await levelChanged(ctx, id, r.before, r.after).catch((e) => log('level role', id, e.message));
  };
  // read messages through PYON (the only agent with the Message Content intent)
  ctx.read = (channelId) => ctx.clients.pyon.channels.fetch(channelId);
  return ctx;
}

async function levelChanged(ctx, id, before, after) {
  const guild = ctx.guild(); if (!guild) return;
  const member = await guild.members.fetch(id).catch(() => null);
  if (!member || member.user.bot) return;
  const levelRoles = LV.MILESTONES.map(([, k]) => ctx.R[k]).filter(Boolean);
  const m = LV.milestoneFor(after), want = m ? ctx.R[m[1]] : null;
  const drop = levelRoles.filter((r) => r !== want && member.roles.cache.has(r));
  if (drop.length) await member.roles.remove(drop, 'MEKANEKO level');
  if (want && !member.roles.cache.has(want)) await member.roles.add(want, 'MEKANEKO level');
  if (after <= before) return;
  const hit = LV.crossed(before, after);
  const text = hit ? `🎉 <@${id}> reached **level ${after}** and is now a **${hit[2]}**! ${hit[3]}` : `⬆️ <@${id}> reached **level ${after}**. Nyan~`;
  await guild.channels.cache.get(ctx.C.levelups)?.send({ content: text, allowedMentions: { parse: [] } });
}

export function jsonStore(file, fallback) {
  mkdirSync(join(file, '..'), { recursive: true });
  let data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : structuredClone(fallback);
  return { get: () => data, set(v) { data = v; writeFileSync(file + '.tmp', JSON.stringify(data, null, 1)); renameSync(file + '.tmp', file); } };
}

// ---------- SHURU: does a name pretend to be the team, an agent or MEKANEKO? ----------
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };
export const normName = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[0134578@$!|]/g, (c) => LEET[c]).replace(/[^a-z0-9]/g, '');
export function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const STAFF_WORDS = /(support|admin|team|mod|moderator|official|help|helpdesk|dev|founder|ceo)/;
// protected: [name, contains-check?]. Short common words (hachi, pyon) only count as a near-exact match.
export function nameFlags(names, protectedNames) {
  const flags = new Set();
  for (const raw of names.filter(Boolean)) {
    const n = normName(raw); if (n.length < 3) continue;
    if (n.includes('mekaneko') && STAFF_WORDS.test(n)) flags.add(`"${raw}" looks like MEKANEKO staff`);
    for (const [p, contains] of protectedNames) {
      const q = normName(p); if (q.length < 4) continue;
      const close = n === q || lev(n, q) <= (q.length >= 6 ? 2 : 1);
      if (close || (contains && n.includes(q) && n !== q)) flags.add(`"${raw}" is close to ${p}`);
    }
  }
  return [...flags];
}
