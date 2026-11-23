// Fixed texts for the non-AI agent features: HACHI's FAQ (EN + JA, with keywords for #help) and MEEMEE's omikuji.
// Keep facts here true today: no token yet, contracts not live, website agent console coming soon for holders.

export const FAQ = {
  what: { q: ['What is MEKANEKO?', 'MEKANEKO とは？'], keys: ['mekaneko', 'what is', 'project', 'about', 'とは', 'apa itu'],
    en: 'MEKANEKO is fifteen AI agents and **Nekopult**, a fair meme coin launchpad on Robinhood Chain. The agents research, check and draft; you decide and you sign. They never touch your keys.\nWorld: https://mekaneko.com · Dashboard: https://app.mekaneko.com',
    ja: 'MEKANEKO は15体のAIエージェントと、Robinhood Chain 上の公平なミームコイン・ローンチパッド **Nekopult** です。エージェントはリサーチ・チェック・下書きを担当し、決めるのも署名するのもあなた自身。鍵に触れることはありません。\nワールド: https://mekaneko.com ・ ダッシュボード: https://app.mekaneko.com' },
  token: { q: ['Is there a token? What is the CA?', 'トークンはある？CAは？'], keys: ['token', ' ca', 'ca?', 'contract', 'address', 'launch date', 'when launch', 'トークン', 'コントラクト', 'kapan'],
    en: '**$MEKANEKO is not live yet.** The one official contract address will appear in #official-links and on the COPY CA button at mekaneko.com, at the same moment. Any CA posted anywhere else, or before that, is fake.',
    ja: '**$MEKANEKO はまだ発行されていません。** 公式のコントラクトアドレスは #official-links と mekaneko.com の COPY CA ボタンに同時に表示されます。それ以外の場所や、それより前に出回る CA はすべて偽物です。' },
  buy: { q: ['How do I buy?', 'どうやって買うの？'], keys: ['buy', 'purchase', 'how to get', 'where to get', '買', 'beli'],
    en: 'Nothing to buy yet: there is no token. When it launches, the official buy link goes in #official-links. Never buy from a link someone DMs you, and never "verify" or "sync" your wallet on a site someone sends.',
    ja: 'まだ購入できるものはありません（トークン未発行）。ローンチ時に公式の購入リンクを #official-links に掲載します。DMで送られてきたリンクからは絶対に買わないでください。' },
  official: { q: ['Official links', '公式リンク'], keys: ['link', 'website', 'official', 'x account', 'twitter', 'site', '公式', 'リンク'],
    en: 'Every official link is in #official-links. If it is not there, it is not us. Website: https://mekaneko.com · Dashboard: https://app.mekaneko.com',
    ja: '公式リンクはすべて #official-links にあります。そこにないものは私たちではありません。' },
  wallet: { q: ['Add Robinhood Chain to my wallet', 'ウォレットに Robinhood Chain を追加'], keys: ['wallet', 'metamask', 'network', 'rpc', 'chain id', '4663', 'add chain', 'rabby', 'ウォレット', 'ネットワーク', 'dompet', 'jaringan'],
    en: 'Easiest: open https://app.mekaneko.com and press Connect; it adds the network for you.\nBy hand: Network **Robinhood Chain** · Chain ID **4663** · Currency **ETH** · Explorer https://robinhoodchain.blockscout.com',
    ja: '一番かんたんなのは https://app.mekaneko.com で「Connect」を押す方法です（ネットワークが自動で追加されます）。\n手動の場合: ネットワーク **Robinhood Chain** ・ チェーンID **4663** ・ 通貨 **ETH** ・ エクスプローラー https://robinhoodchain.blockscout.com' },
  nekopult: { q: ['What is Nekopult?', 'Nekopult とは？'], keys: ['nekopult', 'launchpad', 'bonding', 'create coin', 'launch my', 'ローンチ', 'peluncuran'],
    en: 'Nekopult is MEKANEKO\'s launchpad: create a coin in one transaction, it trades on a public bonding curve, and when the curve fills it graduates to a DEX. The contracts are not live yet; you can walk through the flow on https://app.mekaneko.com.',
    ja: 'Nekopult は MEKANEKO のローンチパッドです。1回のトランザクションでコインを作成し、公開のボンディングカーブで取引され、カーブが満たされると DEX に移行します。コントラクトはまだ稼働前です。' },
  agents: { q: ['What can the agents do here?', 'エージェントは何ができる？'], keys: ['agent', ' ai', 'ask', 'ryujin', 'bot', 'エージェント'],
    en: 'Six agents work in this server: **PYON** `/rank`, **HACHI** `/faq`, **SHURU** `/check`, **KOKEKO** news, **MEEMEE** `/omikuji` and contests, **RYUJIN** `/agents`. Ask anything with `/ask`: 5 free AI questions a day, 10 from level 10. The website console at app.mekaneko.com is open too, with 5 free questions a day.',
    ja: 'このサーバーでは6体のエージェントが活動中: **PYON** `/rank`、**HACHI** `/faq`、**SHURU** `/check`、**KOKEKO** ニュース、**MEEMEE** `/omikuji` とコンテスト、**RYUJIN** `/agents`。`/ask` で AI に何でも質問できます：1日5回まで無料（レベル10からは10回）。app.mekaneko.com のウェブコンソールも1日5回まで無料です。' },
  levels: { q: ['How do levels work?', 'レベルの仕組みは？'], keys: ['level', 'xp', 'rank', 'role', 'stray cat', 'レベル', 'ランク'],
    en: 'Earn XP by chatting (once a minute counts), saying GM every day, sharing memes other members love and joining Town Hall. Level 3 unlocks images, 10 more `/ask` questions, 20 #neon-lounge and outside links, 30 beta testing, 50 your own sticker. Check yours with `/rank`.',
    ja: 'チャット（1分に1回カウント）、毎日の GM、みんなに好かれたミーム、Town Hall 参加で XP がたまります。レベル3で画像投稿、10で `/ask` 追加、20で #neon-lounge と外部リンク、30でベータテスター、50で専用ステッカー。`/rank` で確認できます。' },
  scam: { q: ['Someone DMed me / is this a scam?', 'DMが来た／これは詐欺？'], keys: ['dm', 'scam', 'phishing', 'seed', 'private key', 'hacked', 'drained', 'verify wallet', 'airdrop', '詐欺', 'penipu'],
    en: 'The team and the agents **never DM first** and never ask for your seed phrase or private key. If someone DMs you: don\'t click, don\'t reply, report them in #report-scam (private thread). If you already shared a seed phrase, move your funds to a new wallet now.',
    ja: 'チームとエージェントから**先にDMすることは絶対にありません**。シードフレーズや秘密鍵を聞くこともありません。DMが来たらクリックも返信もせず、#report-scam（プライベートスレッド）で報告してください。すでにシードフレーズを渡した場合は、今すぐ資金を新しいウォレットに移してください。' },
  help: { q: ['How do I get help?', 'サポートの受け方'], keys: ['help', 'support', 'problem', 'error', 'stuck', 'サポート', 'bantuan'],
    en: 'Open a post in #help and pick a tag. Screenshots are welcome; never include your seed phrase. A human from the team replies there, never in DMs.',
    ja: '#help で投稿を作成し、タグを選んでください。スクリーンショット歓迎（シードフレーズは絶対に載せないで）。チームが #help で返信します。DMでは返信しません。' },
};

// the best FAQ entries for a #help post (simple keyword hits, no AI)
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hit = (t, w) => (/^[\x00-\x7f]+$/.test(w) ? new RegExp(`(^|[^a-z0-9])${esc(w.trim())}([^a-z0-9]|$)`).test(t) : t.includes(w));   // whole words; CJK as substrings
export function suggest(text, n = 2) {
  const t = text.toLowerCase();
  return Object.entries(FAQ).map(([k, f]) => [k, f.keys.filter((w) => hit(t, w)).length]).filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

// ---------- MEEMEE's omikuji (a temple fortune slip): one per member per UTC day, same result if asked again ----------
export const FORTUNES = [   // [kanji, romaji, english, weight, line EN, line JA]
  ['大吉', 'Daikichi', 'Great blessing', 12, 'The zodiac is on your side. Make the meme you\'ve been saving.', '十二支があなたの味方。温めていたミームを出すなら今日。'],
  ['中吉', 'Chūkichi', 'Middle blessing', 18, 'Good energy. Say GM to three cats you don\'t know yet.', 'いい流れ。まだ知らない猫3匹に GM を。'],
  ['小吉', 'Shōkichi', 'Small blessing', 22, 'Small wins count. Help one person in #help today.', '小さな勝ちも勝ち。今日は #help で誰か1人を助けよう。'],
  ['吉', 'Kichi', 'Blessing', 22, 'Steady day. Stretch, hydrate, read the rules once more.', '安定した一日。ストレッチ、水分補給、ルールをもう一度。'],
  ['末吉', 'Suekichi', 'Future blessing', 16, 'Luck arrives late. Patience, nyan.', '運は遅れてやってくる。気長に、ニャン。'],
  ['凶', 'Kyō', 'Bad luck', 10, 'Oh no. Tie this slip to the shrine rack and try again tomorrow. Never click links in DMs today.', 'あらら。このおみくじは結んで、また明日。今日はDMのリンクを絶対に踏まないで。'],
];
export const LUCKY_AGENTS = ['RYUJIN', 'NEZU', 'KONKON', 'SHURU', 'NISHIKI', 'CHOTOTSU', 'MEEMEE', 'KOKEKO', 'PYON', 'KAERU', 'TORAMARU', 'GYUDON', 'HACHI', 'UKKI', 'HAYATE'];
export function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
export function omikuji(userId, day) {
  const h = hash(`${userId}:${day}`), total = FORTUNES.reduce((a, f) => a + f[3], 0); let r = h % total, i = 0;
  while (r >= FORTUNES[i][3]) { r -= FORTUNES[i][3]; i++; }
  return { fortune: FORTUNES[i], agent: LUCKY_AGENTS[(h >>> 8) % LUCKY_AGENTS.length], pick: h >>> 16 };
}
