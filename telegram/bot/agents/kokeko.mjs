// KOKEKO 🐔 news, for the team (admins of the group or of the channel), in the group or in a DM with KOKEKO:
//   /announce Title⏎message   posts to the MEKANEKO channel and pins it there (reply to a photo to attach it).
//                             A linked discussion group shows every channel post by itself. No channel set: posts in the group.
//   /x <link to a post on X> [one line]   shares a MEKANEKO post from X the same way
// Rights: in the channel "Post messages" (+ "Edit messages of others" to pin); in the group "Pin messages" + "Delete messages". No AI.
import { esc, L, log, reply } from '../tg.mjs';

const X_POST = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/\w{1,15}\/status\/\d+\S*$/;

export default {
  updates: ['message', 'my_chat_member'],
  commands: [
    { command: 'announce', en: 'Team: post and pin an announcement in the channel', ja: 'チーム: チャンネルにお知らせを投稿して固定', admin: true, dmAllow: true },
    { command: 'x', en: 'Team: share a MEKANEKO post from X', ja: 'チーム: X の投稿を共有', admin: true, dmAllow: true },
  ],
  intro: ['🐔 I’m KOKEKO, MEKANEKO’s news agent. Announcements go up in the MEKANEKO Telegram channel.',
    '🐔 MEKANEKO のニュース担当 KOKEKO です。お知らせは MEKANEKO の Telegram チャンネルに投稿します。'],
  setup(bot, ctx) {
    const api = bot.api;
    const target = () => ctx.channelId || ctx.chatId;
    const where = () => (ctx.channelId ? 'the channel' : 'the group');
    const teamOnly = async (c) => {
      if (await ctx.isTeam(api, c.from, c.msg)) return true;
      await reply(c, L(c.from, 'Team only.', 'チーム専用です。')); return false;
    };
    const tidy = (c) => { if (c.chat.id === ctx.chatId) c.deleteMessage().catch(() => {}); };

    bot.command('announce', async (c) => {
      if (!await teamOnly(c)) return;
      if (!target()) return reply(c, 'No channel or group is set up yet.');
      const body = String(c.match || '').trim(), photo = c.msg.reply_to_message?.photo?.at(-1)?.file_id;
      if (!body) return reply(c, 'Write it like this:\n/announce Title\nThe message (English, 日本語 below if you like)\n\nReply to a photo to attach it.');
      const [title, ...rest] = body.split('\n');
      const text = `📣 <b>${esc(title)}</b>${rest.join('\n').trim() ? `\n\n${esc(rest.join('\n').trim())}` : ''}\n\n<i>KOKEKO · MEKANEKO news</i>`;
      if (photo && text.length > 1024) return reply(c, 'With a photo the text can be 1,024 characters at most. Shorten it, or post without the photo.');
      try {
        const m = photo ? await api.sendPhoto(target(), photo, { caption: text, parse_mode: 'HTML' }) : await api.sendMessage(target(), text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
        const pinned = await api.pinChatMessage(target(), m.message_id, { disable_notification: false }).then(() => true, () => false);
        tidy(c);
        if (c.chat.type === 'private' || !pinned) await reply(c, `Posted in ${where()}${pinned ? ' and pinned' : ', but I couldn’t pin it (give KOKEKO the right to pin there)'}.`);
        log(`kokeko announced "${title.slice(0, 60)}" in ${where()} (by ${c.from.id})`);
      } catch (e) { log('kokeko announce', e.description || e.message); await reply(c, `Couldn’t post in ${where()}: ${esc(e.description || e.message)}. Check that KOKEKO is an admin there with "Post messages".`); }
    });

    bot.command('x', async (c) => {
      if (!await teamOnly(c)) return;
      const [link, ...note] = String(c.match || '').trim().split(/\s+/);
      if (!X_POST.test(link || '')) return reply(c, 'Paste the link of one post on X: /x https://x.com/…/status/… (and an optional line after it).');
      try {
        await api.sendMessage(target(), `🐔 ${esc(note.join(' ') || 'New post from MEKANEKO on X. Like, repost, reply!')}\n${esc(link.replace('twitter.com', 'x.com'))}`, { parse_mode: 'HTML' });
        tidy(c); if (c.chat.type === 'private') await reply(c, `Shared in ${where()}.`);
      } catch (e) { await reply(c, `Couldn’t post in ${where()}: ${esc(e.description || e.message)}`); }
    });
  },
};
