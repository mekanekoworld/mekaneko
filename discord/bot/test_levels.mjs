// node discord/bot/test_levels.mjs: checks the XP rules without Discord
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as LV from './levels.mjs';

assert.deepEqual([3, 10, 20, 30, 50].map((L) => { let x = 0; for (let i = 0; i < L; i++) x += LV.need(i); return x; }), [475, 4675, 23850, 67525, 268375]);
assert.equal(LV.levelOf(474).level, 2); assert.equal(LV.levelOf(475).level, 3); assert.equal(LV.levelOf(0).next, 100);
assert.equal(LV.milestoneFor(2), null); assert.equal(LV.milestoneFor(12)[1], 'lvl10'); assert.equal(LV.crossed(2, 25)[1], 'lvl20');

const u = { xp: 0, last: 0, recent: [], gmDay: '', streak: 0, vDay: '', vXp: 0 }, t0 = Date.UTC(2026, 10, 18, 9);
assert.ok(LV.onMessage(u, 'hello everyone, what a day', t0) >= 15);
assert.equal(LV.onMessage(u, 'another real message here', t0 + 30_000), 0, 'cooldown');
assert.equal(LV.onMessage(u, 'hello everyone, what a day', t0 + 120_000), 0, 'duplicate');
assert.equal(LV.onMessage(u, 'lol ok', t0 + 240_000), 0, 'too short');
assert.equal(LV.onMessage(u, '<:mk_nyan:123> <@456> https://x.com/a', t0 + 360_000), 0, 'emoji, mention and link only');
assert.ok(LV.onMessage(u, 'ニャンニャン最高のコミュニティ', t0 + 480_000) > 0, 'Japanese counts');

for (const s of ['gm', 'GM nya!', 'gm gm', 'good morning cats', 'ohayo', 'おはようございます', '<:mk_gm_nya:111>']) assert.ok(LV.isGM(s), s);
for (const s of ['gmail', 'program', 'enigma']) assert.ok(!LV.isGM(s), s);
const g = { gmDay: '', streak: 0 }; const D = 86_400_000;
assert.equal(LV.onGM(g, t0).streak, 1); assert.equal(LV.onGM(g, t0 + 3600_000), null, 'once a day');
for (let i = 1; i < 6; i++) LV.onGM(g, t0 + i * D);
assert.equal(LV.onGM(g, t0 + 6 * D).xp, 30 + 150, 'day-7 bonus'); assert.equal(LV.onGM(g, t0 + 8 * D).streak, 1, 'missed a day');

const v = { vDay: '', vXp: 0 }; let vx = 0; for (let i = 0; i < 20; i++) vx += LV.onVoiceTick(v, t0); assert.equal(vx, 120, 'voice cap');

const st = new LV.Store(mkdtempSync(join(tmpdir(), 'lv-'))); st.add('a', 500); st.add('b', 100);
assert.deepEqual(st.add('a', -100), { before: 3, after: 2, xp: 400 }); assert.equal(st.rank('a'), 1); assert.equal(st.add('b', -999).xp, 0);
st.save(); assert.equal(new LV.Store(st.f.replace('/levels.json', '')).user('a').xp, 400, 'saved');
console.log('levels: all checks passed');
