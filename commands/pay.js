const db = require('../db/database');
const { t, buildKeyboard, formatDate, addDays } = require('../src/utils');
const config = require('../config');

async function handlePay(ctx) {
    if (db.getSetting('payment_enabled') === '0') {
        const lang = db.getUser(ctx.from.id)?.language || 'id';
        return ctx.reply(lang === 'id' ? '✅ Fitur premium saat ini digratiskan untuk semua pengguna!' : '✅ Premium features are currently free for everyone!');
    }
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';

    if (db.isSubscriptionActive(userId)) {
        const sub = db.getSubscription(userId);
        return ctx.reply(
            t('sub_active', lang, { plan: sub.plan.toUpperCase(), expires: formatDate(sub.expires_at) }),
            { parse_mode: 'HTML' }
        );
    }

    const kb = buildKeyboard([
        [{ text: `⭐ 1 Minggu (${config.PREMIUM_1W_STARS})`, callback_data: 'buy_premium_1w' },
        { text: `⭐ 1 Bulan (${config.PREMIUM_1M_STARS})`, callback_data: 'buy_premium_1m' }],
        [{ text: `⭐ 3 Bulan (${config.PREMIUM_3M_STARS})`, callback_data: 'buy_premium_3m' }],
        [{ text: '💎 Lihat paket VIP (1 Tahun)', callback_data: 'show_vip' }],
    ]);

    await ctx.reply(
        t('pay_title', lang),
        { parse_mode: 'HTML', reply_markup: kb }
    );
}

async function handleVip(ctx) {
    if (db.getSetting('payment_enabled') === '0') {
        const lang = db.getUser(ctx.from.id)?.language || 'id';
        return ctx.reply(lang === 'id' ? '✅ Fitur premium dan VIP saat ini digratiskan!' : '✅ Premium features are currently free!');
    }
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';
    await sendVipMenu(ctx, lang, false);
}

async function sendVipMenu(ctx, lang, isEdit = false) {
    const kb = buildKeyboard([
        [{ text: t('vip_btn', lang, { stars: config.VIP_STARS }), callback_data: 'buy_vip' }],
        [{ text: '⭐ Lihat paket Premium', callback_data: 'show_premium' }],
    ]);

    const text = t('vip_title', lang, { stars: config.VIP_STARS });
    const opts = { parse_mode: 'HTML', reply_markup: kb };

    if (isEdit) {
        await ctx.editMessageText(text, opts);
    } else {
        await ctx.reply(text, opts);
    }
}

async function handlePaySupport(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.reply(
        t('paysupport', lang, { link: config.PAYSUPPORT_LINK }),
        { parse_mode: 'HTML' }
    );
}

// ─── Callback Handlers ────────────────────────────────────────────────────────

async function handleBuyPremium(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.answerCallbackQuery();

    const planData = ctx.callbackQuery.data.replace('buy_premium_', ''); // '1w', '1m', '3m'
    let stars, labelId, labelEn, durationDescId, durationDescEn;

    if (planData === '1w') {
        stars = config.PREMIUM_1W_STARS; labelId = 'Premium 1 Minggu'; labelEn = 'Premium 1 Week';
        durationDescId = 'aktif 1 minggu'; durationDescEn = '1 week';
    } else if (planData === '1m') {
        stars = config.PREMIUM_1M_STARS; labelId = 'Premium 1 Bulan'; labelEn = 'Premium 1 Month';
        durationDescId = 'aktif 1 bulan'; durationDescEn = '1 month';
    } else {
        stars = config.PREMIUM_3M_STARS; labelId = 'Premium 3 Bulan'; labelEn = 'Premium 3 Months';
        durationDescId = 'aktif 3 bulan'; durationDescEn = '3 months';
    }

    await ctx.api.sendInvoice(
        ctx.from.id,
        lang === 'id' ? 'Berlangganan Premium' : 'Premium Subscription',
        lang === 'id'
            ? `Filter gender, tanpa iklan, prioritas pencarian — ${durationDescId}`
            : `Gender filter, no ads, search priority — ${durationDescEn}`,
        `premium_${planData}_subscription`,
        'XTR',   // currency (Stars)
        [{ label: lang === 'id' ? labelId : labelEn, amount: stars }]
    );
}

async function handleBuyVip(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.answerCallbackQuery();
    await ctx.api.sendInvoice(
        ctx.from.id,
        lang === 'id' ? 'Berlangganan VIP' : 'VIP Subscription',
        lang === 'id'
            ? 'Badge VIP, prioritas tertinggi, filter gender, tanpa iklan — aktif 12 bulan'
            : 'VIP badge, highest priority, gender filter, no ads — 12 months',
        'vip_subscription',
        'XTR',   // currency (Stars)
        [{ label: lang === 'id' ? 'VIP 12 Bulan' : 'VIP 12 Months', amount: config.VIP_STARS }]
    );
}

async function handleShowVip(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.answerCallbackQuery();
    await sendVipMenu(ctx, lang, true);
}

async function handleShowPremium(ctx) {
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';
    await ctx.answerCallbackQuery();
    const kb = buildKeyboard([
        [{ text: `⭐ 1 Minggu (${config.PREMIUM_1W_STARS})`, callback_data: 'buy_premium_1w' },
        { text: `⭐ 1 Bulan (${config.PREMIUM_1M_STARS})`, callback_data: 'buy_premium_1m' }],
        [{ text: `⭐ 3 Bulan (${config.PREMIUM_3M_STARS})`, callback_data: 'buy_premium_3m' }],
        [{ text: '💎 Lihat paket VIP (1 Tahun)', callback_data: 'show_vip' }],
    ]);
    await ctx.editMessageText(
        t('pay_title', lang),
        { parse_mode: 'HTML', reply_markup: kb }
    );
}

// ─── Pre-checkout & Payment ───────────────────────────────────────────────────

async function handlePreCheckout(ctx) {
    await ctx.answerPreCheckoutQuery(true);
}

async function handleSuccessfulPayment(ctx) {
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';
    const payment = ctx.message.successful_payment;
    const payload = payment.invoice_payload;
    const starsPaid = payment.total_amount;

    let plan, days;
    if (payload === 'premium_1w_subscription') { plan = 'premium'; days = 7; }
    else if (payload === 'premium_1m_subscription') { plan = 'premium'; days = 30; }
    else if (payload === 'premium_3m_subscription') { plan = 'premium'; days = 90; }
    else if (payload === 'vip_subscription') { plan = 'vip'; days = config.VIP_DAYS; }
    else return;

    const expiresAt = addDays(days);
    db.upsertSubscription(userId, plan, expiresAt, starsPaid);

    const expires = formatDate(expiresAt);
    await ctx.reply(
        t('payment_success', lang, { plan: plan.toUpperCase(), expires }),
        { parse_mode: 'HTML' }
    );

    if (config.LOG_GROUP_ID) {
        try {
            await ctx.api.sendMessage(
                config.LOG_GROUP_ID,
                `💰 <b>Pembayaran Baru</b>\n\nUser: <code>${userId}</code>\nPaket: ${plan.toUpperCase()}\nStars: ${starsPaid}\nBerlaku hingga: ${expires}`,
                { parse_mode: 'HTML' }
            );
        } catch { }
    }
}

module.exports = {
    handlePay,
    handleVip,
    handlePaySupport,
    handleBuyPremium,
    handleBuyVip,
    handleShowVip,
    handleShowPremium,
    handlePreCheckout,
    handleSuccessfulPayment,
};
