// node discord/bot/test_agents.mjs: the non-Discord parts of the agents (FAQ matching, omikuji, look-alike names)
import assert from 'node:assert/strict';
import { suggest, omikuji, FAQ, FORTUNES } from './content.mjs';
import { nameFlags, normName, lev } from './common.mjs';

assert.deepEqual(suggest('How do I add the network to metamask? chain id?'), ['wallet']);
assert.equal(suggest('someone sent me a DM asking for my seed phrase, is this a scam')[0], 'scam');
assert.equal(suggest('when is the token launch, what is the CA?')[0], 'token');
assert.equal(suggest('ウォレットにネットワークを追加できない')[0], 'wallet');
assert.deepEqual(suggest('lovely weather today'), []);
for (const [k, f] of Object.entries(FAQ)) { assert.ok(f.en && f.ja && f.q.length === 2, k); assert.ok(f.en.length < 900 && f.ja.length < 900, k); }

const a = omikuji('123', '2026-11-18'), b = omikuji('123', '2026-11-18'), c = omikuji('123', '2026-11-19');
assert.deepEqual(a, b, 'same slip all day'); assert.ok(c);
const count = {}; for (let i = 0; i < 20000; i++) { const k = omikuji(String(i), '2026-11-18').fortune[0]; count[k] = (count[k] || 0) + 1; }
for (const f of FORTUNES) assert.ok(Math.abs(count[f[0]] / 20000 - f[3] / 100) < 0.02, `weight ${f[0]}: ${count[f[0]]}`);

assert.equal(normName('MEKANEK0 $upport'), 'mekanekosupport'); assert.equal(lev('ryujin', 'ryuj1n'.replace('1', 'i')), 0);
const staff = [['MEKANEKO', false], ['RYUJIN', true], ['SHURU', true], ['HACHI', false], ['PYON', false], ['mekanekoworld', true]];
assert.ok(nameFlags(['MEKANEKO Support'], staff).length, 'staff words');
assert.ok(nameFlags(['Ryujin_official'], staff).length, 'agent name inside');
assert.ok(nameFlags(['ryuj1n'], staff).length, 'leet');
assert.ok(nameFlags(['mekanek0'], staff).length, 'near MEKANEKO');
assert.ok(nameFlags(['mekanekoworId'], staff).length, 'owner look-alike (capital I for l)');
assert.deepEqual(nameFlags(['hachiman_tokyo'], staff), [], 'a common name that only contains HACHI is fine');
assert.deepEqual(nameFlags(['mekaneko_fan'], staff), [], 'fans are fine');
assert.deepEqual(nameFlags(['catlover99', null], staff), []);

// ---------- KOKEKO's Telegram copy (telegram.mjs) against a fake Bot API ----------
import http from 'node:http';
import { toTgHtml, tgPost, tgReady } from './telegram.mjs';
assert.equal(toTgHtml('**Big** news for <@123> in <#456> <:mk_nyan:789>'), '<b>Big</b> news for  in');
assert.equal(toTgHtml('see [the docs](https://app.mekaneko.com/en/docs/) & `code` ~~old~~ *soft* __u__'),
  'see <a href="https://app.mekaneko.com/en/docs/">the docs</a> &amp; <code>code</code> <s>old</s> <i>soft</i> <u>u</u>');
assert.equal(toTgHtml('<script>x</script> at <t:1795000000:F>'), '&lt;script&gt;x&lt;/script&gt; at 2026-11-18 11:06 UTC');
assert.equal(toTgHtml('snake_case_name stays'), 'snake_case_name stays');
const seen = [];
const srv = http.createServer((req, res) => { let raw = ''; req.on('data', (d) => (raw += d)); req.on('end', () => {
  const method = req.url.split('/').pop(); seen.push({ method, body: JSON.parse(raw), token: req.url.split('/')[1] });
  res.end(JSON.stringify({ ok: true, result: { message_id: 50 + seen.length } })); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
Object.assign(process.env, { TG_API_ROOT: `http://127.0.0.1:${srv.address().port}`, TELEGRAM_TOKEN_KOKEKO: '1:TEST', TELEGRAM_CHANNEL_ID: '-100555' });
assert.ok(tgReady());
await tgPost('📣 <b>Hi</b>', { image: 'https://example.com/a.jpg', pin: true });
assert.deepEqual(seen.map((x) => x.method), ['sendPhoto', 'pinChatMessage']);
assert.equal(seen[0].body.chat_id, '-100555'); assert.equal(seen[0].body.caption, '📣 <b>Hi</b>'); assert.equal(seen[1].body.message_id, 51); assert.equal(seen[0].token, 'bot1:TEST');
seen.length = 0; await tgPost('x'.repeat(1500), { image: 'https://example.com/a.jpg' });
assert.deepEqual(seen.map((x) => x.method), ['sendMessage', 'sendPhoto'], 'long text: message first, then the photo');
seen.length = 0; await tgPost('🐔 https://x.com/a/status/1', { preview: true });
assert.equal(seen[0].body.link_preview_options.is_disabled, false);
srv.close();
console.log('agents: all checks passed');
