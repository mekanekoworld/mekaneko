// MEKANEKO levels: the XP rules, the level maths and the store. No Discord in here, so it can be tested on its own (test_levels.mjs).
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const RULES = {
  msg: { min: 15, max: 25, cooldownMs: 60_000, minChars: 8, dupWindow: 5 },   // one rewarded message a minute; short or repeated ones earn nothing
  gm: { xp: 30, streakBonus: { 7: 150, 30: 600, 60: 800, 100: 1500 } },       // first GM of the UTC day in #general / #日本語
  meme: { reactors: 5, xp: 100 },                                              // a #memes-art image that 5 other members react to
  voice: { xp: 10, everyMs: 5 * 60_000, dailyCap: 120 },                       // in Town Hall while a stage is live
  automodPenalty: 50,                                                           // per message AutoMod blocked
  award: { solved: 150, bug: 300, contest: 500 },                               // /award presets (team)
};

// [level, role key in ids.json, role name, what it unlocks]. A member wears one level role: the highest milestone reached.
export const MILESTONES = [
  [3, 'lvl3', 'Stray Cat 野良猫', 'You can post images now.'],
  [10, 'lvl10', 'Alley Cat', 'More /ask questions a day once the agents are live.'],
  [20, 'lvl20', 'Neon Cat', '#neon-lounge is open, and outside links are allowed.'],
  [30, 'lvl30', 'Mecha Cat', "You're on the beta tester list for new agent features."],
  [50, 'lvl50', 'Zodiac Keeper', 'Your own personal MEKANEKO sticker and a place in the Hall of Fame.'],
];

export const need = (L) => 5 * L * L + 50 * L + 100;                       // XP from level L to L+1 (level 3 = 475 XP, 10 = 4,675, 20 = 23,850)
export function levelOf(xp) { let L = 0, left = xp; while (left >= need(L)) { left -= need(L); L++; } return { level: L, into: left, next: need(L) }; }
export const milestoneFor = (level) => [...MILESTONES].reverse().find(([l]) => level >= l) || null;
export const crossed = (before, after) => [...MILESTONES].reverse().find(([l]) => l > before && l <= after) || null;
export const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

// letters and digits that are left once mentions, custom emoji and links are removed
export const textScore = (c) => c.replace(/<a?:\w+:\d+>|<[@#&!]+\d+>|https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}]/gu, '').length;
export const norm = (c) => c.toLowerCase().replace(/\s+/g, ' ').trim();
export const isGM = (c) => /(^|[^\p{L}])(gm+|gmgm|good morning|ohayo+u?)([^\p{L}]|$)|おはよう|<a?:mk_gm_nya:\d+>|:mk_gm_nya:/iu.test(c);

export class Store {
  constructor(dir) {
    mkdirSync(dir, { recursive: true }); this.f = join(dir, 'levels.json');
    this.d = existsSync(this.f) ? JSON.parse(readFileSync(this.f, 'utf8')) : { users: {}, memes: {} }; this.dirty = false;
  }
  user(id) { return (this.d.users[id] ||= { xp: 0, last: 0, recent: [], gmDay: '', streak: 0, vDay: '', vXp: 0 }); }
  add(id, amount) {
    const u = this.user(id), before = levelOf(u.xp).level; u.xp = Math.max(0, u.xp + amount); this.dirty = true;
    return { before, after: levelOf(u.xp).level, xp: u.xp };
  }
  rank(id) { return Object.entries(this.d.users).sort((a, b) => b[1].xp - a[1].xp).findIndex(([k]) => k === id) + 1; }
  top(n) { return Object.entries(this.d.users).filter(([, u]) => u.xp > 0).sort((a, b) => b[1].xp - a[1].xp).slice(0, n); }
  save() {
    if (!this.dirty) return;
    const cut = Date.now() - 30 * 86_400_000; for (const [k, t] of Object.entries(this.d.memes)) if (t < cut) delete this.d.memes[k];
    writeFileSync(this.f + '.tmp', JSON.stringify(this.d)); renameSync(this.f + '.tmp', this.f); this.dirty = false;
  }
}

// a chat message: the XP it earns (0 = none). Updates the anti-farming state either way.
export function onMessage(u, content, now = Date.now()) {
  const R = RULES.msg, n = norm(content), dup = !!n && u.recent.includes(n);
  if (n) u.recent = [n, ...u.recent].slice(0, R.dupWindow);
  if (dup || textScore(content) < R.minChars || now - u.last < R.cooldownMs) return 0;
  u.last = now; return R.min + Math.floor(Math.random() * (R.max - R.min + 1));
}
// the first GM of the UTC day: XP, the streak, and a bonus on day 7, 30, 60 and 100
export function onGM(u, now = Date.now()) {
  const today = day(now); if (u.gmDay === today) return null;
  u.streak = u.gmDay === day(now - 86_400_000) ? u.streak + 1 : 1; u.gmDay = today;
  return { xp: RULES.gm.xp + (RULES.gm.streakBonus[u.streak] || 0), streak: u.streak };
}
export function onVoiceTick(u, now = Date.now()) {
  const today = day(now); if (u.vDay !== today) { u.vDay = today; u.vXp = 0; }
  if (u.vXp >= RULES.voice.dailyCap) return 0; u.vXp += RULES.voice.xp; return RULES.voice.xp;
}
