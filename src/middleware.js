const { InlineKeyboard } = require('grammy');
const db = require('../db/database');
const { t } = require('./utils');
const config = require('../config');

/**
 * grammY middleware: check ban status before every update.
 * Stops the middleware chain if banned.
 */
async function checkBanMiddleware(ctx, next) {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const user = db.getUser(userId);
    if (user?.is_banned) {
        const lang = user.language || 'id';
        await ctx.reply(
            t('banned', lang, {
                reason: user.ban_reason || '-',
                support: config.PAYSUPPORT_LINK,
            })
        );
        return; // Stop chain
    }
    return next();
}

/**
 * grammY middleware: maintenance mode check.
 * Admins bypass maintenance mode.
 */
async function checkMaintenanceMiddleware(ctx, next) {
    if (db.getSetting('maintenance_mode') !== '1') return next();
    if (config.ADMIN_IDS.includes(ctx.from?.id)) return next();
    await ctx.reply(t('maintenance', ctx.session?.lang || 'id'));
}

/**
 * grammY middleware: upsert user on every update.
 */
async function upsertUserMiddleware(ctx, next) {
    if (ctx.from && !ctx.from.is_bot) {
        db.upsertUser({
            id: ctx.from.id,
            username: ctx.from.username || null,
            first_name: ctx.from.first_name || null,
        });
    }
    return next();
}

/**
 * Rate limiter middleware: max 3 actions per 2 seconds per user.
 */
const rateLimitMap = new Map();
async function rateLimiterMiddleware(ctx, next) {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const now = Date.now();
    const entry = rateLimitMap.get(userId) || { count: 0, reset: now + 2000 };
    if (now > entry.reset) {
        entry.count = 0;
        entry.reset = now + 2000;
    }
    entry.count++;
    rateLimitMap.set(userId, entry);

    if (entry.count > 5) return; // silently drop
    return next();
}

/**
 * Check FSUB for a specific user — returns true if passed.
 * Used inside command handlers (not as middleware) because it needs the bot instance.
 */
async function checkFsub(api, userId, lang = 'id') {
    const fsubEnabled = db.getSetting('fsub_enabled') === '1';
    if (!fsubEnabled) return true;

    const channels = db.getFsubChannels();
    if (!channels.length) return true;

    const notJoined = [];
    for (const ch of channels) {
        try {
            const member = await api.getChatMember(ch.chat_id, userId);
            if (!['member', 'administrator', 'creator'].includes(member.status)) {
                notJoined.push(ch);
            }
        } catch {
            notJoined.push(ch);
        }
    }

    if (!notJoined.length) return true;

    const channelList = notJoined
        .map((c, i) => `${i + 1}. ${c.title || c.chat_id}${c.link ? ` — ${c.link}` : ''}`)
        .join('\n');

    const kb = new InlineKeyboard();
    for (const c of notJoined) {
        const url = c.link || `https://t.me/c/${String(c.chat_id).replace('-100', '')}`;
        kb.url(`${t('fsub_join_btn', lang)} ${c.title || c.chat_id}`, url).row();
    }
    kb.text(t('fsub_check_btn', lang), 'fsub_check');

    let fsubText = db.getSetting('fsub_text');
    if (!fsubText) {
        // Fallback to default
        fsubText = t('fsub_required', lang, { channels: '{channels}' });
    }
    fsubText = fsubText.replace('{channels}', channelList);

    await api.sendMessage(
        userId,
        fsubText,
        { parse_mode: 'HTML', reply_markup: kb }
    );
    return false;
}

module.exports = {
    checkBanMiddleware,
    checkMaintenanceMiddleware,
    upsertUserMiddleware,
    rateLimiterMiddleware,
    checkFsub,
};
