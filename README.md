# MEKANEKO

Fifteen AI agents for Robinhood Chain, the Nekopult launchpad interface, and the bots that run the MEKANEKO community.
This repository is the public part of the code, published so anyone can check what the agents and bots actually do.

- Website: https://mekaneko.com
- Dashboard and agent console: https://app.mekaneko.com
- Docs and whitepaper: https://app.mekaneko.com/en/docs/
- Verify (contract, rules, wallets, audits): https://app.mekaneko.com/en/verify/
- Status: https://app.mekaneko.com/en/status/
- X: https://x.com/mekanekoworld · Discord: https://discord.gg/42sGtf5Xx2 · Telegram: https://t.me/+kzi75X8ljrU3Yjg1

## What is here

| Folder | What it is |
| --- | --- |
| `dashboard/agents/` | The agent server: the fifteen agents, their instructions and voices, their tools (Robinhood Chain RPC, GeckoTerminal, DexScreener), daily limits, and the live facts they read from the site config. |
| `dashboard/agents/gate/` | The Gate SHURU runs before any "is it safe to buy" answer: route, price impact, pool depth, fees, a simulated buy and sell, transfer tax, contract red flags. Read-only. Ported from [Troya Agent](https://github.com/troyaagent/troya-agent) (MIT); its license is in that folder. |
| `dashboard/agents/gate/sentry.mjs` | Sentry: every new Pons launch goes through the Gate; only coins with real buying (0.5 ETH+ from 25+ independent wallets, no copies, no look-alike names) are posted by KOKEKO. Ported from Troya Agent (MIT). |
| `dashboard/app/` | The app pages we wrote ourselves: agent console, Nekopult (sample data until its contracts are live), docs, status, verify. |
| `discord/bot/` | The six Discord agents: PYON (levels), RYUJIN (`/ask`), HACHI (FAQ), SHURU (`/check`, scam watch), KOKEKO (news, `/trend`, Market Omikuji), MEEMEE (fortunes, meme contests). |
| `telegram/bot/` | The same agents for Telegram: captcha, scam and link filter, FAQ, levels, announcements. |

## What is not here, on purpose

- Secrets of any kind: bot tokens, API keys, server settings. They live only on our server.
- The moderation word lists the bots use to catch scams (publishing them would help scammers get around them).
- Marketing plans, brand source files, and our deployment configuration.
- MEKANEKO WORLD, the 3D site.

So the bots in this repository do not run as they are: they need their own tokens and a few private files. The tests do run:

```
cd discord/bot && npm ci && node test_levels.mjs && node test_agents.mjs
cd telegram/bot && npm ci && node test_rules.mjs
```

## Safety

The team and the agents never DM first and never ask for a seed phrase or a private key. The agents prepare
transactions; only you sign them, in your own wallet. Nothing here is financial advice.

The one official $MEKANEKO contract address appears on https://app.mekaneko.com/en/verify/, on X, in Discord and in
Telegram at the same moment. Any address you see before that is fake.

## License

MIT, see [LICENSE](LICENSE).
