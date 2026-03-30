const db = require('../db/database');
const { t, getIdleKeyboard, getChatKeyboard } = require('./utils');
const config = require('../config');

// Injected lazily to avoid circular dependency
let _showFeedbackPrompt = null;
function setFeedbackPrompt(fn) { _showFeedbackPrompt = fn; }

/**
 * Add user to search queue and attempt a match.
 * @param {import('grammy').Api} api - grammY Api object (ctx.api or bot.api)
 */
async function startSearch(api, userId, lang = 'id') {
    if (db.isInQueue(userId)) {
        await api.sendMessage(userId, t('already_searching', lang), { reply_markup: getIdleKeyboard(lang) });
        return;
    }
    if (db.getActiveSession(userId)) {
        await api.sendMessage(userId, t('already_in_chat', lang));
        return;
    }

    const user = db.getUser(userId);
    const plan = db.getSubscriptionPlan(userId);
    const priority = plan === 'vip' ? 2 : plan === 'premium' ? 1 : 0;
    const genderFilter =
        plan !== 'free' && user?.gender && user.gender !== 'any' ? user.gender : 'any';

    db.addQueue(userId, genderFilter, priority);

    await api.sendMessage(userId, t('searching', lang), { reply_markup: getIdleKeyboard(lang) });
    await runMatchmaking(api);
}

/**
 * Full queue scan — tries to pair every compatible waiting user.
 * @param {import('grammy').Api} api
 */
async function runMatchmaking(api) {
    const queue = db.getQueue();
    if (queue.length < 2) return;

    const matched = new Set();

    for (let i = 0; i < queue.length; i++) {
        if (matched.has(queue[i].user_id)) continue;

        for (let j = i + 1; j < queue.length; j++) {
            if (matched.has(queue[j].user_id)) continue;

            const a = queue[i];
            const b = queue[j];
            const aUser = db.getUser(a.user_id);
            const bUser = db.getUser(b.user_id);

            const aGender = aUser?.gender || 'any';
            const bGender = bUser?.gender || 'any';
            if (a.gender_filter !== 'any' && a.gender_filter !== bGender) continue;
            if (b.gender_filter !== 'any' && b.gender_filter !== aGender) continue;

            // ✅ Match!
            matched.add(a.user_id);
            matched.add(b.user_id);

            db.removeQueue(a.user_id);
            db.removeQueue(b.user_id);

            const sessionId = db.createSession(a.user_id, b.user_id);
            db.incrementTotalChats(a.user_id);
            db.incrementTotalChats(b.user_id);

            const aLang = aUser?.language || 'id';
            const bLang = bUser?.language || 'id';
            const aPlan = db.getSubscriptionPlan(a.user_id);
            const bPlan = db.getSubscriptionPlan(b.user_id);

            // VIP badge notification
            if (aPlan === 'vip') {
                await api.sendMessage(b.user_id, t('partner_vip', bLang), { parse_mode: 'HTML' });
            }
            if (bPlan === 'vip') {
                await api.sendMessage(a.user_id, t('partner_vip', aLang), { parse_mode: 'HTML' });
            }

            await Promise.all([
                api.sendMessage(
                    a.user_id,
                    t('partner_found', aLang, { bot_username: config.BOT_USERNAME }),
                    { parse_mode: 'HTML', reply_markup: getChatKeyboard(aLang) }
                ),
                api.sendMessage(
                    b.user_id,
                    t('partner_found', bLang, { bot_username: config.BOT_USERNAME }),
                    { parse_mode: 'HTML', reply_markup: getChatKeyboard(bLang) }
                ),
            ]);

            break;
        }
    }
}

/**
 * End the current session for a user (/stop or /next).
 * @param {import('grammy').Api} api
 */
async function endChat(api, userId, lang = 'id', showFeedback = true) {
    const session = db.getActiveSession(userId);
    if (!session) {
        await api.sendMessage(userId, t('not_in_chat', lang));
        return null;
    }

    const partnerId =
        session.user1_id === userId ? session.user2_id : session.user1_id;
    const partnerUser = db.getUser(partnerId);
    const partnerLang = partnerUser?.language || 'id';

    db.endSession(session.id, userId);

    await api.sendMessage(userId, t('chat_stopped', lang), { reply_markup: getIdleKeyboard(lang) });

    // Ad for free users — shown after chat ends
    const userPlan = db.getSubscriptionPlan(userId);
    if (userPlan === 'free') {
        await api.sendMessage(
            userId,
            `📢 <i>Nikmati obrolan tanpa iklan, filter gender, dan prioritas pencarian.\nGunakan /pay untuk berlangganan Premium.</i>`,
            { parse_mode: 'HTML' }
        );
    }

    await api.sendMessage(
        partnerId,
        t('partner_left', partnerLang, { bot_username: config.BOT_USERNAME }),
        { parse_mode: 'HTML', reply_markup: getIdleKeyboard(partnerLang) }
    );

    // Ad for the partner too (if free)
    const partnerPlan = db.getSubscriptionPlan(partnerId);
    if (partnerPlan === 'free') {
        await api.sendMessage(
            partnerId,
            `📢 <i>Nikmati obrolan tanpa iklan, filter gender, dan prioritas pencarian.\nGunakan /pay untuk berlangganan Premium.</i>`,
            { parse_mode: 'HTML' }
        );
    }

    if (showFeedback && _showFeedbackPrompt) {
        setTimeout(() => {
            _showFeedbackPrompt(api, partnerId, userId, session.id, partnerLang);
        }, 1000);
    }

    return { session, partnerId };
}

module.exports = { startSearch, runMatchmaking, endChat, setFeedbackPrompt };
