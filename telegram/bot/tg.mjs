// Shared by every Telegram agent in this process: the group lock, the level store (the Discord XP rules, its own file),
// XP grants, admin checks, small JSON stores and HTML helpers (all texts use parse_mode HTML).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import * as LV from './vendor/levels.mjs';
import { jsonStore } from './vendor/common.mjs';

export const log = (...a) => console.log(new Date().toISOString(), ...a);
export const FAST = process.env.MK_TG_FAST === '1';                 // tests: short timers

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const nameOf = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() || (u?.username ? '@' + u.username : 'cat');
export const mention = (u) => `<a href="tg://user?id=${u.id}">${esc(nameOf(u))}</a>`;
export const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');   // the FAQ is written for Discord
export const isJa = (u) => /^ja/i.test(u?.language_code || '');
export const L = (u, en, ja) => (isJa(u) ? ja : en);
export const threadOf = (msg) => (msg?.is_topic_message ? { message_thread_id: msg.message_thread_id } : {});
export const HTML = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };

// a reply in the same chat (and forum topic) as the command
export const reply = (c, text, extra = {}) => c.api.sendMessage(c.chat.id, text, {
  ...HTML, ...threadOf(c.msg), ...(c.msg ? { reply_parameters: { message_id: c.msg.message_id, allow_sending_without_reply: true } } : {}), ...extra });

// what each milestone unlocks on Telegram (Telegram has no roles, so the level name shows in /rank and in the level-up line)
export const PERKS = {
  3: ['You can forward posts from channels now.', 'チャンネルの投稿を転送できるようになりました。'],
  10: ['More /ask questions a day once the agents are live.', 'エージェントが稼働したら、1日の /ask の回数が増えます。'],
  20: ['Outside links are allowed for you now.', '外部リンクを投稿できるようになりました。'],
  30: ["You're on the beta tester list for new agent features.", '新しいエージェント機能のベータテスターに登録されました。'],
  50: ['Your own personal MEKANEKO sticker and a place in the Hall of Fame.', 'あなた専用の MEKANEKO ステッカーと殿堂入り。'],
};

export function makeCtx() {
  const dataDir = process.env.MK_DATA || fileURLToPath(new URL('./data', import.meta.url));
  mkdirSync(dataDir, { recursive: true });
  const envChat = Number(process.env.TELEGRAM_CHAT_ID) || null;
  const moved = jsonStore(join(dataDir, 'chat.json'), {});          // a group that became a supergroup gets a new id
  const ctx = { dataDir, store: new LV.Store(dataDir), bots: {}, events: new EventEmitter(), log };
  ctx.chatId = (moved.get().from === envChat && moved.get().id) || envChat;
  ctx.modlogId = Number(process.env.TELEGRAM_MODLOG_CHAT) || null;   // optional private chat for SHURU's notes
  ctx.channelId = Number(process.env.TELEGRAM_CHANNEL_ID) || null;   // the MEKANEKO channel (KOKEKO posts there); the group is its discussion chat
  ctx.json = (name, fallback) => jsonStore(join(dataDir, name), fallback);
  ctx.level = (id) => LV.levelOf(ctx.store.d.users[String(id)]?.xp || 0).level;
  ctx.say = (api, text, extra = {}) => api.sendMessage(ctx.chatId, text, { ...HTML, ...extra });
  ctx.later = (api, msgId, ms) => setTimeout(() => api.deleteMessage(ctx.chatId, msgId).catch(() => {}), ms);
  ctx.modlog = (api, text) => (ctx.modlogId ? api.sendMessage(ctx.modlogId, text, HTML).catch((e) => log('modlog', e.message)) : null);

  // admins (and the owner), cached for 10 minutes. A message the group sends as itself comes from an anonymous admin.
  let admins = { at: 0, ids: new Set(), list: [] };
  ctx.admins = async (api, fresh = false) => {
    if (!fresh && admins.list.length && Date.now() - admins.at < 10 * 60_000) return admins;
    const list = await api.getChatAdministrators(ctx.chatId);
    admins = { at: Date.now(), ids: new Set(list.map((m) => m.user.id)), list: list.map((m) => m.user) };
    return admins;
  };
  ctx.isAdmin = async (api, user, msg) => {
    if (msg?.sender_chat && [ctx.chatId, ctx.channelId].includes(msg.sender_chat.id)) return true;
    if (!user || !ctx.chatId) return false;
    try { return (await ctx.admins(api)).ids.has(user.id); } catch (e) { log('admins', e.message); return false; }
  };
  // the team: admins of the group or of the channel (KOKEKO also takes /announce in DMs, where there is no group to look at)
  let chanAdmins = { at: 0, ids: new Set() };
  ctx.isTeam = async (api, user, msg) => {
    if (await ctx.isAdmin(api, user, msg)) return true;
    if (!user || !ctx.channelId) return false;
    try {
      if (Date.now() - chanAdmins.at > 10 * 60_000) chanAdmins = { at: Date.now(), ids: new Set((await api.getChatAdministrators(ctx.channelId)).map((m) => m.user.id)) };
      return chanAdmins.ids.has(user.id);
    } catch (e) { log('channel admins', e.description || e.message); return false; }
  };

  // XP: one store for every agent. A milestone (level 3, 10, 20, 30, 50) is announced in the group; other levels stay quiet.
  ctx.grant = async (user, amount, why) => {
    if (!amount || !user || user.is_bot) return;
    const id = String(user.id), r = ctx.store.add(id, amount);
    if (user.first_name) ctx.store.user(id).name = nameOf(user);
    if (why) log(`${amount > 0 ? '+' : ''}${amount} ${id} (${why}) -> ${r.xp} XP, level ${r.after}`);
    const hit = r.after > r.before ? LV.crossed(r.before, r.after) : null;
    const api = (ctx.bots.pyon || Object.values(ctx.bots)[0])?.api;
    if (hit && api && user.first_name) {
      const p = PERKS[hit[0]] || ['', ''];
      await ctx.say(api, `🎉 ${mention(user)} reached <b>level ${r.after}</b> and is now a <b>${esc(hit[2])}</b>! ${esc(L(user, p[0], p[1]))}`).catch((e) => log('level-up', e.message));
    }
  };

  // only the MEKANEKO group: other groups are left, and before TELEGRAM_CHAT_ID is set nothing happens in any group
  const seen = new Set(), left = new Set();
  ctx.setChat = (id) => { moved.set({ from: envChat, id }); ctx.chatId = id; admins = { at: 0, ids: new Set(), list: [] }; };
  ctx.guard = (NAME) => async (c, next) => {
    const chat = c.chat;
    if (!chat || chat.type === 'private') return next();
    if (chat.type === 'channel') {                                  // only our channel; nothing to do there but post (KOKEKO)
      if (c.myChatMember && ctx.channelId && chat.id !== ctx.channelId) { log(`${NAME}: leaving channel ${chat.id} "${chat.title}"`); await c.api.leaveChat(chat.id).catch(() => {}); }
      return;
    }
    if (ctx.chatId && c.msg?.migrate_from_chat_id === ctx.chatId) { log(`${NAME}: the group is a supergroup now (${chat.id})`); ctx.setChat(chat.id); return; }
    if (ctx.chatId && chat.id === ctx.chatId && c.msg?.migrate_to_chat_id) { log(`${NAME}: the group moved to ${c.msg.migrate_to_chat_id}`); ctx.setChat(c.msg.migrate_to_chat_id); return; }
    if (!ctx.chatId) { if (!seen.has(chat.id)) { seen.add(chat.id); log(`${NAME}: in chat ${chat.id} "${chat.title}" (${chat.type}); set TELEGRAM_CHAT_ID to use it`); } return; }
    if (chat.id === ctx.chatId) return next();
    if (chat.id === ctx.modlogId) return;
    if (c.myChatMember || !left.has(chat.id)) { left.add(chat.id); log(`${NAME}: leaving ${chat.id} "${chat.title}" (not the MEKANEKO group)`); await c.api.leaveChat(chat.id).catch(() => {}); }
  };
  return ctx;
}
