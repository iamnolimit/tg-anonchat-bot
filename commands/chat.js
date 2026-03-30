const db = require('../db/database');
const { t, buildKeyboard, escapeHtml } = require('../src/utils');
const { endChat, startSearch } = require('../src/matching');
const config = require('../config');

async function handleNext(ctx) {
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';

    if (db.getActiveSession(userId)) {
        await endChat(ctx.api, userId, lang, true);
        setTimeout(async () => {
            await startSearch(ctx.api, userId, lang);
        }, 1200);
    } else {
        db.removeQueue(userId); // clear stale queue entry if any
        await startSearch(ctx.api, userId, lang);
    }
}

async function handleStop(ctx) {
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';

    if (db.isInQueue(userId)) {
        db.removeQueue(userId);
        await ctx.reply(t('search_cancelled', lang));
        return;
    }

    await endChat(ctx.api, userId, lang, true);
}

async function handleLink(ctx) {
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';

    const session = db.getActiveSession(userId);
    if (!session) {
        await ctx.reply(t('not_in_chat', lang));
        return;
    }

    const partnerId =
        session.user1_id === userId ? session.user2_id : session.user1_id;
    const user = db.getUser(userId);
    const name = escapeHtml(user?.first_name || ctx.from.first_name || 'User');

    const kb = buildKeyboard([
        [{ text: t('link_btn', lang), url: `tg://user?id=${userId}` }],
    ]);

    await ctx.api.sendMessage(
        partnerId,
        t('link_msg', lang, { name }),
        { parse_mode: 'HTML', reply_markup: kb }
    );

    await ctx.reply('✅ Profil kamu sudah dikirim ke pasangan.');
}

module.exports = { handleNext, handleStop, handleLink };
