// Tests for SHURU's filter (rules.mjs): node test_rules.mjs
import assert from 'node:assert/strict';
import { inspect, linkVerdict, keywordRegex, LINKS } from './rules.mjs';

const ent = (text, type = 'url') => ({ text, entities: [{ type, offset: 0, length: text.length }] });
const kind = (msg, level = 0) => inspect(msg, level)?.kind ?? null;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

ok('official and allowed hosts pass', () => {
  for (const u of ['https://mekaneko.com', 'mekaneko.com', 'https://app.mekaneko.com/en/', 'https://x.com/someone/status/1', 'youtu.be/abc', 'https://dexscreener.com/robinhood'])
    assert.equal(linkVerdict(u), null, u);
});
ok('outside links are removed below level 20 and allowed from 20', () => {
  assert.equal(kind(ent('https://evil.example/claim')), 'link');
  assert.equal(kind(ent('https://x.com.evil.site/a')), 'link');         // exact host match
  assert.equal(kind(ent('https://evil.example/claim'), 20), null);
});
ok('hidden text_link targets are seen', () => {
  assert.equal(kind({ text: 'official site', entities: [{ type: 'text_link', offset: 0, length: 13, url: 'https://evil.example' }] }), 'link');
});
ok('our Telegram invite passes, other Telegram links count as invites (even at level 50)', () => {
  assert.equal(linkVerdict(LINKS.telegramUrl), null);
  assert.equal(kind(ent('t.me/mekanekoworld')), null);
  assert.equal(kind(ent('https://t.me/+KZI75X8LJRU3YJG1')), 'invite');   // invite codes are case-sensitive
  assert.equal(kind(ent('https://t.me/joinchat/AAAA'), 50), 'invite');
  assert.equal(kind(ent('https://t.me/somechannel')), 'invite');
  assert.equal(kind(ent('tg://join?invite=abc')), 'invite');
});
ok('only our Discord invite passes', () => {
  assert.equal(linkVerdict(LINKS.discordUrl), null);
  assert.equal(linkVerdict('https://discord.gg/abc123'), 'invite');
  assert.equal(linkVerdict('https://discord.com/invite/abc123'), 'invite');
});
ok('scam words, any level', () => {
  for (const t of ['send me your seed phrase', 'Validate your wallet here', 'DM me for support', 'claim your airdrop now', 'シードフレーズを教えて', 'my MNEMONIC words'])
    assert.equal(kind({ text: t }, 50), 'scam', t);
  for (const t of ['gm nya', 'what is the CA?', 'I love the seed of this idea', 'airdrops are fun'])
    assert.equal(kind({ text: t }), null, t);
});
ok('risky files and early forwards', () => {
  assert.equal(kind({ document: { file_name: 'wallet-fix.apk' } }, 50), 'file');
  assert.equal(kind({ document: { file_name: 'notes.pdf' } }), null);
  assert.equal(kind({ text: 'look', forward_origin: { type: 'channel', chat: { title: 'Pump group' } } }), 'forward');
  assert.equal(kind({ text: 'look', forward_origin: { type: 'channel', chat: { title: 'x' } } }, 3), null);
  assert.equal(kind({ text: 'look', forward_origin: { type: 'user' } }), null);
});
ok('url buttons on inline-bot messages are checked', () => {
  assert.equal(kind({ text: 'hi', reply_markup: { inline_keyboard: [[{ text: 'Claim', url: 'https://evil.example' }]] } }), 'link');
});
ok('keyword syntax: whole words unless starred', () => {
  const r = keywordRegex(['rectify', 'mnemonic*', '*秘密鍵*']);
  assert.ok(r.test('please rectify it')); assert.ok(!r.test('rectifying'));
  assert.ok(r.test('mnemonics')); assert.ok(r.test('この秘密鍵は'));
});
console.log(`rules: ${n} tests passed`);
