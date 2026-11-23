// RYUJIN 🐉 commander for the Telegram group: /agents shows the fifteen and where each one works; /ask answers "coming soon" until
// the AI is live (then it becomes the real thing, with daily limits). No AI yet.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { esc, L, reply } from '../tg.mjs';

const ICON = { RYUJIN: '🐉', NEZU: '🐭', KONKON: '🦊', SHURU: '🐍', NISHIKI: '🐟', CHOTOTSU: '🐗', MEEMEE: '🐐', KOKEKO: '🐔', PYON: '🐰',
  KAERU: '🐸', TORAMARU: '🐯', GYUDON: '🐮', HACHI: '🐶', UKKI: '🐵', HAYATE: '🐴' };
const HERE = { SHURU: 'captcha · scam filter · /check', HACHI: 'welcomes · /faq · /links', PYON: '/rank · levels', KOKEKO: 'announcements',
  MEEMEE: '/omikuji · meme contests', RYUJIN: '/agents · /ask soon' };
const VIA_ASK = ['NEZU', 'GYUDON', 'NISHIKI', 'HAYATE'], TEAM = ['CHOTOTSU', 'KONKON', 'UKKI'], WEB = ['KAERU', 'TORAMARU'];

export default {
  updates: ['message', 'my_chat_member'],
  commands: [
    { command: 'agents', en: 'Meet the fifteen MEKANEKO agents', ja: '15体のエージェント紹介', dm: true },
    { command: 'ask', en: 'Ask the MEKANEKO agents (AI coming soon)', ja: 'エージェントに質問（AI はまもなく）', dm: true },
  ],
  intro: ['🐉 I’m RYUJIN, commander of the MEKANEKO zodiac. Try /agents. My AI wakes up soon.',
    '🐉 MEKANEKO 十二支の司令官、RYUJIN です。/agents をどうぞ。AI はまもなく目覚めます。'],
  setup(bot) {
    let profiles = {};
    try { profiles = JSON.parse(readFileSync(fileURLToPath(new URL('../vendor/agents-profile.json', import.meta.url)), 'utf8')).agents || {}; } catch {}
    const line = (n, extra) => `${ICON[n] || '•'} <b>${n}</b> · ${esc(profiles[n]?.role_en || '')}${extra ? ` · ${esc(extra)}` : ''}`;

    bot.command('agents', (c) => reply(c, ['🐉 <b>The MEKANEKO zodiac: fifteen agents, one job each</b>', '',
      '<b>In this group</b>', ...Object.keys(HERE).map((n) => line(n, HERE[n])), '',
      '<b>Through RYUJIN’s /ask (soon)</b>', ...VIA_ASK.map((n) => line(n)), '',
      '<b>Team only</b>', ...TEAM.map((n) => line(n)), '',
      '<b>On the website: app.mekaneko.com</b>', ...WEB.map((n) => line(n)), '',
      '<i>Long ago, the cat missed the zodiac race. So the cat built a new one.</i>'].join('\n')));

    bot.command('ask', (c) => reply(c, L(c.from,
      '🐉 My AI answers in this group soon. Right now you can ask me on the website, app.mekaneko.com (5 free questions a day), or with /ask on our Discord. Here: /faq (HACHI), /check (SHURU), /omikuji (MEEMEE), /rank (PYON).',
      '🐉 このグループでの AI の回答はまもなく始まります。今はウェブ app.mekaneko.com（1日5回まで無料）か、Discord の /ask で質問できます。ここでは /faq（HACHI）、/check（SHURU）、/omikuji（MEEMEE）、/rank（PYON）をどうぞ。')));
  },
};
