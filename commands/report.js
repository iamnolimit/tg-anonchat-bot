const { InlineKeyboard } = require('grammy');
const db = require('../db/database');
const { t, buildKeyboard, escapeHtml } = require('../src/utils');
const config = require('../config');

const REPORT_CATEGORIES = [
    { id: 'spam', id_label: '🚫 Spam', en_label: '🚫 Spam' },
    { id: 'ads', id_label: '📢 Iklan', en_label: '📢 Ads' },
    { id: 'selling', id_label: '🛒 Berjualan', en_label: '🛒 Selling' },
    { id: 'child_violence', id_label: '👶 Kekerasan Anak', en_label: '👶 Child Violence' },
    { id: 'begging', id_label: '🙏 Mengemis', en_label: '🙏 Begging' },
    { id: 'insult', id_label: '💢 Menghina', en_label: '💢 Insult' },
    { id: 'violence', id_label: '⚔️ Kekerasan', en_label: '⚔️ Violence' },
    { id: 'suicide', id_label: '☠️ Propaganda Bunuh Diri', en_label: '☠️ Suicide Propaganda' },
    { id: 'nsfw', id_label: '🔞 Vulgar / Sange', en_label: '🔞 NSFW / Explicit' },
];

/**
 * Show post-chat feedback prompt with Laporkan button.
 * Called from matching.js after a chat ends.
 * @param {import('grammy').Api} api - grammY Api object (ctx.api or bot.api)
 */
async function showFeedbackPrompt(api, userId, partnerId, sessionId, lang = 'id') {
    const kb = new InlineKeyboard().text(
        t('report_btn', lang),
        `report_open:${partnerId}:${sessionId}`
    );
    try {
        await api.sendMessage(userId, t('feedback_prompt', lang), { reply_markup: kb });
    } catch { }
}

/**
 * "Laporkan" button → show category picker.
 */
async function handleReportOpen(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    const [, reportedId, sessionId] = ctx.callbackQuery.data.split(':');

    // Save pending report data in session
    ctx.session.pendingReport = { reportedId: parseInt(reportedId), sessionId: parseInt(sessionId) };

    await ctx.answerCallbackQuery();

    const kb = new InlineKeyboard();
    for (const cat of REPORT_CATEGORIES) {
        kb.text(
            lang === 'id' ? cat.id_label : cat.en_label,
            `report_cat:${cat.id}:${reportedId}:${sessionId}`
        ).row();
    }

    await ctx.reply(t('report_categories', lang), { reply_markup: kb });
}

/**
 * Category selected — save report and notify log group.
 */
async function handleReportCategory(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    const parts = ctx.callbackQuery.data.split(':');
    const categoryId = parts[1];
    const reportedId = parseInt(parts[2], 10);
    const sessionId = parseInt(parts[3], 10);

    await ctx.answerCallbackQuery({ text: lang === 'id' ? 'Laporan diterima ✅' : 'Report received ✅' });

    const cat = REPORT_CATEGORIES.find((c) => c.id === categoryId);
    const catLabel = cat ? (lang === 'id' ? cat.id_label : cat.en_label) : categoryId;

    const reportId = db.createReport(ctx.from.id, reportedId, catLabel, sessionId);
    ctx.session.pendingReport = null;

    // Remove keyboard
    try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch { }

    await ctx.reply(t('report_sent', lang));

    // Notify log group
    if (config.LOG_GROUP_ID) {
        const reporterUser = db.getUser(ctx.from.id);
        const reportedUser = db.getUser(reportedId);
        const reporterName = escapeHtml(reporterUser?.first_name || String(ctx.from.id));
        const reportedName = escapeHtml(reportedUser?.first_name || String(reportedId));
        const totalReports = db.getReportsByUser(reportedId).length;

        const kb = new InlineKeyboard()
            .text(`🔨 Ban User ${reportedId}`, `admin_ban:${reportedId}`)
            .row()
            .text(`👁 Lihat laporan`, `admin_reports:${reportedId}`);

        try {
            await ctx.api.sendMessage(
                config.LOG_GROUP_ID,
                `🚨 <b>Laporan Baru #${reportId}</b>\n\n` +
                `👤 Pelapor: <code>${ctx.from.id}</code> (${reporterName})\n` +
                `🎯 Dilaporkan: <code>${reportedId}</code> (${reportedName})\n` +
                `📋 Kategori: ${catLabel}\n` +
                `🗂 Sesi: #${sessionId}\n` +
                `📊 Total laporan pada user ini: ${totalReports}`,
                { parse_mode: 'HTML', reply_markup: kb }
            );
        } catch (err) {
            console.error('[Report] Log group error:', err.message);
        }
    }
}

/**
 * Ban user from report button in log group.
 */
async function handleAdminBanFromReport(ctx) {
    if (!config.ADMIN_IDS.includes(ctx.from.id)) {
        await ctx.answerCallbackQuery({ text: '❌ Tidak ada akses.' });
        return;
    }
    const reportedId = parseInt(ctx.callbackQuery.data.split(':')[1], 10);
    db.banUser(reportedId, 'Dilaporkan oleh pengguna');
    await ctx.answerCallbackQuery({ text: `✅ User ${reportedId} dibanned.` });

    try {
        await ctx.editMessageReplyMarkup(
            new InlineKeyboard().text('🔓 Unban', `admin_unban:${reportedId}`)
        );
    } catch { }

    // Notify banned user
    const bannedUser = db.getUser(reportedId);
    const bannedLang = bannedUser?.language || 'id';
    try {
        await ctx.api.sendMessage(
            reportedId,
            t('banned', bannedLang, { reason: 'Dilaporkan oleh pengguna', support: config.PAYSUPPORT_LINK })
        );
    } catch { }
}

module.exports = { showFeedbackPrompt, handleReportOpen, handleReportCategory, handleAdminBanFromReport };
