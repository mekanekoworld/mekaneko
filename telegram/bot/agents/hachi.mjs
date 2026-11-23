// HACHI 🐶 support for the Telegram group: welcomes members who passed SHURU's captcha (a few per message, so the chat stays readable),
// /faq (topic buttons; the answers are the Discord FAQ adapted for Telegram), /links (the official links) and /rules. No AI.
import { InlineKeyboard } from 'grammy';
import { TG_FAQ, RULES, linksText } from '../text.mjs';
import { mention, md, L, isJa, log, FAST, reply, HTML } from '../tg.mjs';

const BATCH = 5, EVERY = FAST ? 300 : 2 * 60_000;

const menu = (ja) => {
  const kb = new InlineKeyboard();
  Object.entries(TG_FAQ).forEach(([k, f], i) => { kb.text(f.q[ja ? 1 : 0], `faq:${k}:${ja ? 'ja' : 'en'}`); if (i % 2) kb.row(); });
  return kb;
};
const answer = (k, ja) => `🐶 <b>${md(TG_FAQ[k].q[ja ? 1 : 0])}</b>\n${md(ja ? TG_FAQ[k].ja : TG_FAQ[k].en)}`;

export default {
  updates: ['message', 'callback_query', 'my_chat_member'],
  commands: [
    { command: 'faq', en: 'Quick answers from HACHI', ja: 'HACHI のよくある質問', dm: true },
    { command: 'links', en: 'The official MEKANEKO links', ja: 'MEKANEKO の公式リンク', dm: true },
    { command: 'rules', en: 'The group rules', ja: 'グループのルール', dm: true },
  ],
  intro: ['🐶 I’m HACHI, MEKANEKO’s support agent. Try /faq, /links or /rules. The team never DMs first and never asks for your seed phrase.',
    '🐶 MEKANEKO のサポート担当 HACHI です。/faq、/links、/rules をどうぞ。チームから先にDMすることはなく、シードフレーズを聞くこともありません。'],
  setup(bot, ctx) {
    const api = bot.api;

    // ---------- welcome: members SHURU let in (or an admin added) ----------
    const queue = [];
    ctx.events.on('verified', (u) => { if (!u.is_bot) queue.push(u); });
    setInterval(async () => {
      while (queue.length) {
        const seen = new Set(), batch = queue.splice(0, BATCH).filter((u) => !seen.has(u.id) && seen.add(u.id));
        await ctx.say(api, `🐾 Welcome to MEKANEKO World, ${batch.map(mention).join(', ')}! Trust only /links, read /rules, and ask anything here (/faq has quick answers). Say GM nya to start your streak.\nようこそ！公式リンクは /links、ルールは /rules。毎日 GM でストリークを伸ばそう。`)
          .catch((e) => log('hachi welcome', e.description || e.message));
      }
    }, EVERY);

    bot.command('faq', async (c) => {
      const ja = isJa(c.from), key = String(c.match || '').trim().toLowerCase();
      if (TG_FAQ[key]) return reply(c, answer(key, ja));
      return reply(c, L(c.from, '🐶 What would you like to know?', '🐶 何について知りたいですか？'), { reply_markup: menu(ja) });
    });
    bot.callbackQuery(/^faq:(\w+):(en|ja)$/, async (c) => {
      const [, key, lang] = c.match, ja = lang === 'ja';
      try {
        if (key === 'menu') await c.editMessageText(ja ? '🐶 何について知りたいですか？' : '🐶 What would you like to know?', { reply_markup: menu(ja) });
        else if (TG_FAQ[key]) await c.editMessageText(answer(key, ja), { ...HTML, reply_markup: new InlineKeyboard().text(ja ? '◀ 質問一覧' : '◀ All topics', `faq:menu:${lang}`) });
      } catch (e) { if (!/not modified/.test(e.description || '')) log('hachi faq', e.description || e.message); }
      return c.answerCallbackQuery();
    });
    bot.command('links', (c) => reply(c, linksText(isJa(c.from))));
    bot.command('rules', (c) => reply(c, `${RULES.en}\n\n${RULES.ja}`));
  },
};
