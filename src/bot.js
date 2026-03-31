'use strict';

require('dotenv').config();
const { Bot, session, GrammyError, HttpError, InputFile } = require('grammy');
const { run } = require('@grammyjs/runner');
const fs = require('fs');
const cron = require('node-cron');
const config = require('../config');
const db = require('../db/database');

// ─── Commands ─────────────────────────────────────────────────────────────────
const { handleStart } = require('../commands/start');
const { handleNext, handleStop, handleLink } = require('../commands/chat');
const {
    handleSettings,
    handleGenderLocked, handleGenderMenu, handleGenderSet,
    handleAgeMenu, handleLangMenu, handleLangSet,
    handleSettingsDone, handleAgeInput,
} = require('../commands/settings');
const { handleHelp, handleRules, handleTerms } = require('../commands/info');
const {
    handlePay, handleVip, handlePaySupport,
    handleBuyPremium, handleBuyVip, handleShowVip, handleShowPremium,
    handlePreCheckout, handleSuccessfulPayment,
} = require('../commands/pay');
const {
    showFeedbackPrompt,
    handleReportOpen, handleReportCategory, handleAdminBanFromReport,
} = require('../commands/report');
const { handleAdmin, handleAdminCallback, handleAdminInput, isAdmin } = require('../commands/admin');

// ─── Core ─────────────────────────────────────────────────────────────────────
const { relayMessage } = require('./relay');
const {
    checkBanMiddleware, checkMaintenanceMiddleware,
    upsertUserMiddleware, rateLimiterMiddleware, checkFsub,
} = require('./middleware');
const { setFeedbackPrompt } = require('./matching');

// ─── Init DB ──────────────────────────────────────────────────────────────────
db.initDB();
setFeedbackPrompt(showFeedbackPrompt);

// ─── Create Bot ───────────────────────────────────────────────────────────────
const bot = new Bot(config.BOT_TOKEN);

// ─── Session ──────────────────────────────────────────────────────────────────
// Session stored in-memory (SQLite is used for persistent data via db module)
bot.use(
    session({
        initial: () => ({
            awaitingAge: false,
            adminAction: null,
            pendingReport: null,
        }),
    })
);

// ─── Fast relay path ─────────────────────────────────────────────────────────
// For users already in an active chat, relay IMMEDIATELY before any other
// middleware runs. This skips DB-heavy ban/maintenance checks for every
// relayed message, dramatically reducing per-message overhead.
bot.on('message', async (ctx, next) => {
    // Only handle private chats — ignore groups, supergroups, channels
    if (ctx.chat?.type !== 'private') return;
    // Only intercept non-command, non-payment messages
    if (ctx.message.text?.startsWith('/')) return next();
    if (ctx.message.successful_payment) return next();

    const userId = ctx.from?.id;
    if (!userId) return next();

    // Skip fast relay if message matches a keyboard button
    const txt = ctx.message.text;
    if (txt === '🛑 Stop' || txt === '⏭ Next' || txt === '👤 Share Profile') return next();

    // Rate limiter still applies
    const now = Date.now();
    const _rl = global._rl || (global._rl = new Map());
    const e = _rl.get(userId) || { c: 0, r: now + 2000 };
    if (now > e.r) { e.c = 0; e.r = now + 2000; }
    e.c++; _rl.set(userId, e);
    if (e.c > 8) return; // hard rate limit, drop silently

    // Check if this user is in an active session
    const partnerId = db.getPartner(userId);
    if (!partnerId) return next(); // not in chat — fall through to normal flow

    // User is mid-chat: relay immediately, skip heavy middleware
    const { relayMessage: _relay } = require('./relay');
    await _relay(ctx);
    // Do NOT call next() — message is handled
});

// ─── Global Middleware (for non-relay messages) ───────────────────────────────
bot.use(rateLimiterMiddleware);
bot.use(upsertUserMiddleware);
bot.use(checkMaintenanceMiddleware);
bot.use(checkBanMiddleware);

// ─── Commands ─────────────────────────────────────────────────────────────────
bot.command(['start', 'search'], handleStart);
bot.command('next', handleNext);
bot.command('stop', handleStop);
bot.command('link', handleLink);
bot.command('settings', handleSettings);
bot.command('help', handleHelp);
bot.command('rules', handleRules);
bot.command('terms', handleTerms);
bot.command('pay', handlePay);
bot.command('vip', handleVip);
bot.command('paysupport', handlePaySupport);
bot.command('admin', handleAdmin);

// ─── Callback Query Routing ───────────────────────────────────────────────────

// FSUB re-check
bot.callbackQuery('fsub_check', async (ctx) => {
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';
    const passed = await checkFsub(ctx.api, userId, lang);
    if (passed) {
        await ctx.answerCallbackQuery({ text: '✅ Terverifikasi! Ketik /start.' });
    } else {
        await ctx.answerCallbackQuery({ text: '❌ Kamu belum bergabung semua channel.' });
    }
});

// Settings
bot.callbackQuery('set_gender_locked', handleGenderLocked);
bot.callbackQuery('set_gender', handleGenderMenu);
bot.callbackQuery(/^gender_(any|male|female)$/, handleGenderSet);
bot.callbackQuery('set_age', handleAgeMenu);
bot.callbackQuery('set_lang', handleLangMenu);
bot.callbackQuery(/^lang_(id|en)$/, handleLangSet);
bot.callbackQuery('settings_done', handleSettingsDone);

// Gender Search (Filter Partner)
bot.callbackQuery(/^search_gender_(any|male|female)$/, async (ctx) => {
    const filter = ctx.match[1];
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => { });
    const { startSearch } = require('../src/matching');
    await startSearch(ctx.api, userId, lang, filter);
});

// Payment
bot.callbackQuery(/^buy_premium_(1w|1m|3m)$/, handleBuyPremium);
bot.callbackQuery('buy_vip', handleBuyVip);
bot.callbackQuery('show_vip', handleShowVip);
bot.callbackQuery('show_premium', handleShowPremium);

// Reports
bot.callbackQuery(/^report_open:/, handleReportOpen);
bot.callbackQuery(/^report_cat:/, handleReportCategory);
bot.callbackQuery(/^admin_ban:\d+$/, handleAdminBanFromReport);

// Admin
bot.callbackQuery(/^adm_/, handleAdminCallback);
bot.callbackQuery(/^admin_(unban|reports):/, handleAdminCallback);

// ─── Pre-checkout & Payment ───────────────────────────────────────────────────
bot.on('pre_checkout_query', handlePreCheckout);
bot.on('message:successful_payment', handleSuccessfulPayment);

// ─── Message Handler ──────────────────────────────────────────────────────────
bot.on('message', async (ctx) => {
    // Only handle private chats — ignore all groups, supergroups, channels
    if (ctx.chat?.type !== 'private') return;
    // Skip commands (already handled above)
    if (ctx.message.text?.startsWith('/')) return;

    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';

    // 0) Handle Main ReplyKeyboard Buttons
    const text = ctx.message.text;
    if (text === '🔍 Cari Pasangan' || text === '🔍 Find Partner') {
        const { handleStart } = require('../commands/start');
        ctx.message.text = '/start'; // fake it for downstream
        return handleStart(ctx);
    }
    if (text === '🚻 Cari Berdasarkan Gender' || text === '🚻 Search by Gender') {
        const plan = db.getSubscriptionPlan(userId);
        const paymentEnabled = db.getSetting('payment_enabled') !== '0';
        if (plan === 'free' && paymentEnabled) {
            const { handlePay } = require('../commands/pay');
            return handlePay(ctx);
        } else {
            const { buildKeyboard } = require('./utils');
            const kb = buildKeyboard([[
                { text: lang === 'id' ? '👥 Semua' : '👥 Any', callback_data: 'search_gender_any' },
                { text: lang === 'id' ? '👨 Pria' : '👨 Male', callback_data: 'search_gender_male' },
                { text: lang === 'id' ? '👩 Wanita' : '👩 Female', callback_data: 'search_gender_female' },
            ]]);
            return ctx.reply(
                lang === 'id' ? '🚻 Pilih gender pasangan yang dicari:' : '🚻 Select partner gender:',
                { reply_markup: kb }
            );
        }
    }
    if (text === '🛑 Stop') {
        const { handleStop } = require('../commands/chat');
        return handleStop(ctx);
    }
    if (text === '⏭ Next') {
        const { handleNext } = require('../commands/chat');
        return handleNext(ctx);
    }
    if (text === '👤 Share Profile') {
        const { handleLink } = require('../commands/chat');
        return handleLink(ctx);
    }

    // 1) Admin input (broadcast, ban, fsub_add)
    if (isAdmin(userId)) {
        const handled = await handleAdminInput(ctx);
        if (handled) return;
    }

    // 2) Age input (settings flow, stored in session)
    if (ctx.session.awaitingAge) {
        await handleAgeInput(ctx);
        return;
    }

    // 3) Relay — already handled by fast path above; this is a safety fallback
    const partner = db.getPartner(userId);
    if (partner) {
        await relayMessage(ctx);
        return;
    }

    // 4) No partner, no pending state — nudge user
    if (ctx.message.text) {
        await ctx.reply(
            lang === 'id'
                ? '💬 Kamu belum terhubung dengan siapapun.\n\nGunakan /search untuk mencari pasangan.'
                : '💬 You are not connected to anyone.\n\nUse /search to find a partner.'
        );
    }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[Error] Update ${ctx?.update?.update_id}:`);
    if (err.error instanceof GrammyError) {
        console.error('[grammY Error]', err.error.description);
    } else if (err.error instanceof HttpError) {
        console.error('[HTTP Error]', err.error);
    } else {
        console.error('[Unknown Error]', err.error);
    }
});

// ─── Cron: Auto-backup at 00:00 WIB (17:00 UTC) ──────────────────────────────
cron.schedule('0 17 * * *', async () => {
    console.log('[Cron] Nightly backup...');
    try {
        const dest = await db.backupDatabase();
        if (config.LOG_GROUP_ID) {
            await bot.api.sendDocument(config.LOG_GROUP_ID, new InputFile(dest), {
                caption: '💾 <b>Nightly Backup</b>',
                parse_mode: 'HTML'
            });
            fs.unlinkSync(dest); // Delete local zip after sending to log group
            console.log(`[Cron] Nightly backup sent to log group and deleted locally.`);
        }
    } catch (e) {
        console.error('[Cron Backup Error]', e);
    }
});

// ─── Start with concurrent runner ────────────────────────────────────────────
// @grammyjs/runner processes updates from different users concurrently
// (separate lanes per user_id), eliminating head-of-line blocking.
const runner = run(bot, {
    runner: { fetch: { allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] } },
});

bot.api.getMe().then((me) => console.log(`[Bot] @${me.username} is running with concurrent runner!`));

process.once('SIGINT', () => runner.isRunning() && runner.stop());
process.once('SIGTERM', () => runner.isRunning() && runner.stop());
