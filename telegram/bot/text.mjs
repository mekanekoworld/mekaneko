// Telegram versions of the shared texts. The FAQ comes from the Discord agents (vendor/content.mjs); only the answers that
// point at Discord channels or Discord-only features are rewritten here. Keep facts true today: no token yet, contracts not live.
import { FAQ } from './vendor/content.mjs';
import { LINKS } from './rules.mjs';
import { esc } from './tg.mjs';

const sub = (s) => s.replace(/#official-links/g, '/links');
const OVR = {
  official: { en: 'Every official link is in /links (and in #official-links on our Discord). If it is not there, it is not us.',
    ja: '公式リンクはすべて /links（Discord の #official-links にも）にあります。そこにないものは私たちではありません。' },
  scam: { en: 'The team and the agents **never DM first** and never ask for your seed phrase or private key. If someone DMs you: don\'t click, don\'t reply, and tell an admin here. If you already shared a seed phrase, move your funds to a new wallet now.',
    ja: 'チームとエージェントから**先にDMすることは絶対にありません**。シードフレーズや秘密鍵を聞くこともありません。DMが来たらクリックも返信もせず、このグループの管理者に知らせてください。すでにシードフレーズを渡した場合は、今すぐ資金を新しいウォレットに移してください。' },
  help: { en: 'Ask right here in the group. Screenshots are welcome; never include your seed phrase. A human from the team replies here, never in DMs.',
    ja: 'このグループでそのまま質問してください。スクリーンショット歓迎（シードフレーズは絶対に載せないで）。チームはここで返信します。DMでは返信しません。' },
  levels: { en: 'Earn XP by chatting (once a minute counts), saying GM every day and sharing memes other members react to. Level 3 lets you forward posts, 10 brings more `/ask` questions, 20 allows outside links, 30 beta testing, 50 your own sticker. Check yours with `/rank`. Telegram and Discord levels are separate.',
    ja: 'チャット（1分に1回カウント）、毎日の GM、みんながリアクションしたミームで XP がたまります。レベル3で転送、10で `/ask` 追加、20で外部リンク、30でベータテスター、50で専用ステッカー。`/rank` で確認できます。Telegram と Discord のレベルは別々です。' },
  agents: { en: 'Six agents work in this group: **SHURU** keeps it safe and `/check`s contracts, **HACHI** `/faq` and welcomes, **PYON** `/rank`, **KOKEKO** news, **MEEMEE** `/omikuji` and meme contests, **RYUJIN** `/agents`. AI answers with `/ask` arrive in this group soon. Until then, ask the agents with `/ask` on our Discord or on the website console at app.mekaneko.com (5 free questions a day).',
    ja: 'このグループでは6体のエージェントが活動中: **SHURU** 安全管理と `/check`、**HACHI** `/faq` と歓迎、**PYON** `/rank`、**KOKEKO** ニュース、**MEEMEE** `/omikuji` とミームコンテスト、**RYUJIN** `/agents`。このグループの AI の `/ask` はまもなく登場。それまでは Discord の `/ask` か、app.mekaneko.com のウェブコンソール（1日5回まで無料）で質問できます。' },
};
export const TG_FAQ = Object.fromEntries(Object.entries(FAQ).map(([k, f]) => [k, { q: f.q, en: OVR[k]?.en ?? sub(f.en), ja: OVR[k]?.ja ?? sub(f.ja) }]));

export const RULES = {
  en: ['<b>MEKANEKO World · group rules</b>', '',
    '1. <b>Be kind.</b> No hate, no harassment, no NSFW.',
    '2. <b>No scams, no shilling.</b> No other projects\' links, no "DM me" offers, no fake giveaways.',
    '3. <b>Never share your seed phrase or private key.</b> The team and the agents never DM first.',
    '4. <b>Official links live in /links.</b> Other links are removed automatically.',
    '5. <b>English and 日本語 are both welcome.</b>',
    '6. <b>Admins have the final say.</b> Breaking the rules can mean a mute or a ban.'].join('\n'),
  ja: ['<b>MEKANEKO World · グループのルール</b>', '',
    '1. <b>やさしく。</b>ヘイト、嫌がらせ、NSFW は禁止。',
    '2. <b>詐欺・宣伝は禁止。</b>他プロジェクトのリンク、「DMして」、偽のプレゼント企画はNG。',
    '3. <b>シードフレーズや秘密鍵は絶対に共有しない。</b>チームとエージェントから先にDMすることはありません。',
    '4. <b>公式リンクは /links にあります。</b>それ以外のリンクは自動で削除されます。',
    '5. <b>English も日本語も歓迎です。</b>',
    '6. <b>最終判断は管理者が行います。</b>違反するとミュートや追放になることがあります。'].join('\n'),
};

// the official links, from the live sites' config (deploy/production.json). The CA shows only once it is set there.
export function linksText(ja) {
  const soon = ja ? '近日公開' : 'Coming soon';
  const row = (k, v) => `${k}: ${v ? esc(v) : soon}`;
  const ca = /^0x[0-9a-fA-F]{40}$/.test(LINKS.ca) ? LINKS.ca : '';
  return [ja ? '<b>MEKANEKO 公式リンク</b>' : '<b>Official MEKANEKO links</b>', '',
    row('🌐 Website', LINKS.worldUrl), row('🧭 Dashboard', LINKS.appUrl), row('💬 Discord', LINKS.discordUrl),
    row(ja ? '✈️ Telegram グループ' : '✈️ Telegram group', LINKS.telegramUrl), row('𝕏 X', LINKS.xUrl), ...(LINKS.githubUrl ? [row('💻 GitHub', LINKS.githubUrl)] : []), '',
    ca ? `🪙 ${ja ? 'コントラクト' : 'Contract'} ($MEKANEKO · Robinhood Chain):\n<code>${ca}</code>`
      : (ja ? '🪙 <b>$MEKANEKO はまだ発行されていません。</b>ここに表示される前に出回る CA はすべて偽物です。' : '🪙 <b>$MEKANEKO is not live yet.</b> Any contract address you see before it appears here is fake.'),
    ...(LINKS.buyUrl ? [row(ja ? '🛒 購入' : '🛒 Buy', LINKS.buyUrl)] : []), '',
    ja ? 'ここにないものは私たちではありません。' : "If it isn't here, it isn't us."].join('\n');
}
