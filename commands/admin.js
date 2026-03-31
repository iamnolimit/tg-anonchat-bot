const { InlineKeyboard, InputFile } = require('grammy');
const fs = require('fs');
const { exec } = require('child_process');
const db = require('../db/database');
const { t, buildKeyboard, formatDate, escapeHtml } = require('../src/utils');
const config = require('../config');
const fetch = require('node-fetch') || global.fetch; // Use native fetch if available

function isAdmin(userId) {
    return config.ADMIN_IDS.includes(userId);
}

// ─── Admin panel entry ────────────────────────────────────────────────────────

async function handleAdmin(ctx) {
    if (!isAdmin(ctx.from.id)) {
        const lang = db.getUser(ctx.from.id)?.language || 'id';
        return ctx.reply(t('admin_only', lang));
    }
    await sendAdminPanel(ctx, false);
}

async function sendAdminPanel(ctx, isEdit = false) {
    const kb = buildKeyboard([
        [
            { text: '📊 Statistik', callback_data: 'adm_stats' },
            { text: '📡 FSUB', callback_data: 'adm_fsub' },
        ],
        [
            { text: '📤 Media Log', callback_data: 'adm_medialog' },
            { text: '💾 Backup DB', callback_data: 'adm_backup' },
        ],
        [
            { text: '📥 Restore DB', callback_data: 'adm_restore' },
            { text: '📣 Broadcast', callback_data: 'adm_broadcast' },
        ],
        [
            { text: '🔨 Ban/Unban', callback_data: 'adm_banmenu' },
            { text: '💰 Fitur Premium', callback_data: 'adm_payment_toggle' },
        ],
        [
            { text: '🔧 Maintenance', callback_data: 'adm_maintenance' },
            { text: '🔄 Update Bot (Git Pull)', callback_data: 'adm_update' }
        ]
    ]);

    const text = '🛠 <b>Admin Panel</b>';
    const opts = { parse_mode: 'HTML', reply_markup: kb };

    if (isEdit) {
        await ctx.editMessageText(text, opts);
    } else {
        await ctx.reply(text, opts);
    }
}

// ─── Callback router ─────────────────────────────────────────────────────────

async function handleAdminCallback(ctx) {
    if (!isAdmin(ctx.from.id)) {
        await ctx.answerCallbackQuery({ text: '❌ Tidak ada akses.' });
        return;
    }

    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    // ─── STATS ──────────────────────────────────────────────────────────────

    if (data === 'adm_stats') {
        const kb = buildKeyboard([[{ text: '⬅️ Kembali', callback_data: 'adm_back' }]]);
        return ctx.editMessageText(
            `📊 <b>Statistik Bot</b>\n\n` +
            `👥 Total Pengguna: <b>${db.getTotalUsers()}</b>\n` +
            `💬 Chat Aktif: <b>${db.getActiveSessions().length}</b>\n` +
            `⏳ Antrian: <b>${db.getQueueSize()}</b>\n` +
            `📅 Sesi Hari Ini: <b>${db.getTodaySessionCount()}</b>`,
            { parse_mode: 'HTML', reply_markup: kb }
        );
    }

    // ─── FSUB ───────────────────────────────────────────────────────────────

    if (data === 'adm_fsub') {
        const fsubEnabled = db.getSetting('fsub_enabled') === '1';
        const channels = db.getFsubChannels();
        let text = `📡 <b>Kelola FSUB</b>\n\nStatus: ${fsubEnabled ? '✅ Aktif' : '❌ Nonaktif'}\n\n`;
        text += channels.length
            ? channels.map((c, i) => `${i + 1}. ${escapeHtml(c.title || '-')} (<code>${c.chat_id}</code>)`).join('\n')
            : 'Belum ada channel FSUB.';

        const kb = buildKeyboard([
            [{ text: fsubEnabled ? '🔴 Nonaktifkan' : '🟢 Aktifkan', callback_data: 'adm_fsub_toggle' }],
            [{ text: '➕ Tambah Channel', callback_data: 'adm_fsub_add' }],
            [{ text: '➖ Hapus Channel', callback_data: 'adm_fsub_remove' }],
            [{ text: '📝 Ubah Teks FSUB', callback_data: 'adm_fsub_text' }],
            [{ text: '⬅️ Kembali', callback_data: 'adm_back' }],
        ]);
        return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    }

    if (data === 'adm_fsub_toggle') {
        const current = db.getSetting('fsub_enabled') === '1';
        db.setSetting('fsub_enabled', current ? '0' : '1');
        await ctx.answerCallbackQuery(`📡 FSUB ${!current ? 'Diaktifkan' : 'Dinonaktifkan'}`);
        // Refresh the FSUB menu inline
        ctx.callbackQuery.data = 'adm_fsub';
        return handleAdminCallback(ctx);
    }

    if (data === 'adm_fsub_add') {
        ctx.session.adminAction = 'fsub_add';
        const kb = buildKeyboard([[{ text: '⬅️ Kembali', callback_data: 'adm_fsub' }]]);
        return ctx.editMessageText(
            '📡 Kirim <b>chat_id</b> channel yang ingin ditambahkan:\n\n<i>Contoh: -1001234567890</i>\n\nBot harus sudah menjadi admin di channel tersebut.',
            { parse_mode: 'HTML', reply_markup: kb }
        );
    }

    if (data === 'adm_fsub_remove') {
        const channels = db.getFsubChannels();
        if (!channels.length) return ctx.answerCallbackQuery('❌ Belum ada channel FSUB.');
        const buttons = channels.map((c) => [
            { text: `🗑 ${c.title || c.chat_id}`, callback_data: `adm_fsub_del:${c.chat_id}` },
        ]);
        buttons.push([{ text: '⬅️ Kembali', callback_data: 'adm_fsub' }]);
        return ctx.editMessageText('Pilih channel yang ingin dihapus:', { reply_markup: buildKeyboard(buttons) });
    }

    if (data.startsWith('adm_fsub_del:')) {
        const chatId = parseInt(data.split(':')[1], 10);
        db.removeFsub(chatId);
        await ctx.answerCallbackQuery(`✅ Channel dihapus.`);
        ctx.callbackQuery.data = 'adm_fsub_remove';
        return handleAdminCallback(ctx);
    }

    if (data === 'adm_fsub_text') {
        ctx.session.adminAction = 'fsub_text';
        const kb = buildKeyboard([[{ text: '⬅️ Kembali', callback_data: 'adm_fsub' }]]);
        return ctx.editMessageText(
            '📝 Kirim teks baru untuk peringatan FSUB.\n\nGunakan <code>{channels}</code> sebagai tempat di mana daftar channel akan ditampilkan.\n\n📝 <i>Teks saat ini:</i>\n' + escapeHtml(db.getSetting('fsub_text') || '(Menggunakan teks default sistem)'),
            { parse_mode: 'HTML', reply_markup: kb }
        );
    }

    // ─── MEDIA LOG ──────────────────────────────────────────────────────────

    if (data === 'adm_medialog') {
        const enabled = db.getSetting('media_log_enabled') === '1';
        const kb = buildKeyboard([
            [{ text: enabled ? '🔴 Nonaktifkan' : '🟢 Aktifkan', callback_data: 'adm_medialog_toggle' }],
            [{ text: '⬅️ Kembali', callback_data: 'adm_back' }],
        ]);
        return ctx.editMessageText(
            `📤 <b>Media Log</b>\n\nStatus: ${enabled ? '✅ Aktif' : '❌ Nonaktif'}\n\nJika aktif, media user diteruskan ke grup log.`,
            { parse_mode: 'HTML', reply_markup: kb }
        );
    }

    if (data === 'adm_medialog_toggle') {
        const current = db.getSetting('media_log_enabled') === '1';
        db.setSetting('media_log_enabled', current ? '0' : '1');
        await ctx.answerCallbackQuery(`Media log ${!current ? 'Diaktifkan' : 'Dinonaktifkan'}`);
        ctx.callbackQuery.data = 'adm_medialog';
        return handleAdminCallback(ctx);
    }

    // ─── BACKUP ─────────────────────────────────────────────────────────────

    if (data === 'adm_backup') {
        const msg = await ctx.reply('⏳ <i>Membuat backup ZIP, mohon tunggu...</i>', { parse_mode: 'HTML' });
        try {
            const dest = await db.backupDatabase();
            await ctx.replyWithDocument(new InputFile(dest), {
                caption: `💾 <b>Backup Selesai</b>\n\nFile: <code>${dest}</code>`,
                parse_mode: 'HTML'
            });
            fs.unlinkSync(dest); // Delete local zip after sending
            await ctx.api.deleteMessage(ctx.chat.id, msg.message_id).catch(() => { });
        } catch (err) {
            await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `❌ Backup gagal: ${err.message}`);
        }
        return;
    }

    // ─── RESTORE ────────────────────────────────────────────────────────────

    if (data === 'adm_restore') {
        ctx.session.adminAction = 'restore_db';
        const kb = buildKeyboard([[{ text: '⬅️ Batal & Kembali', callback_data: 'adm_back' }]]);
        return ctx.editMessageText(
            '📥 <b>Restore Database</b>\n\nKirimkan file <b>.zip</b> backup database yang ingin direstore.\n\n⚠️ <i>WARNING: Ini akan menimpa seluruh data saat ini!</i>',
            { parse_mode: 'HTML', reply_markup: kb }
        );
    }

    // ─── BROADCAST ──────────────────────────────────────────────────────────

    if (data === 'adm_broadcast') {
        ctx.session.adminAction = 'broadcast';
        const kb = buildKeyboard([[{ text: '⬅️ Batal & Kembali', callback_data: 'adm_back' }]]);
        return ctx.editMessageText(
            '📣 Kirim pesan yang akan di-broadcast ke semua pengguna:',
            { parse_mode: 'HTML', reply_markup: kb }
        );
    }

    // ─── BAN MENU ───────────────────────────────────────────────────────────

    if (data === 'adm_banmenu') {
        ctx.session.adminAction = 'ban_input';
        const kb = buildKeyboard([[{ text: '⬅️ Batal & Kembali', callback_data: 'adm_back' }]]);
        return ctx.editMessageText(
            '🔨 Kirim <b>user_id</b> untuk di-ban atau di-unban:\n\n<i>Contoh: 123456789</i>',
            { parse_mode: 'HTML', reply_markup: kb }
        );
    }

    // ─── UPDATE BOT (GIT PULL) ──────────────────────────────────────────────

    if (data === 'adm_update') {
        const msg = await ctx.reply('⏳ <i>Melakukan git pull...</i>', { parse_mode: 'HTML' });
        exec('git pull', async (err, stdout, stderr) => {
            let text = `<b>Git Pull Result</b>\n<pre>${escapeHtml(stdout || stderr || 'Done')}</pre>`;
            if (err) {
                text += `\n\n❌ Error:\n<pre>${escapeHtml(err.message)}</pre>`;
                await ctx.api.editMessageText(ctx.chat.id, msg.message_id, text, { parse_mode: 'HTML' });
            } else {
                text += '\n\n🔄 <i>Mereset bot dalam 2 detik...</i>';
                await ctx.api.editMessageText(ctx.chat.id, msg.message_id, text, { parse_mode: 'HTML' });
                setTimeout(() => process.exit(1), 2000); // Exits so PM2 auto-restarts it
            }
        });
        return;
    }

    // ─── MAINTENANCE ────────────────────────────────────────────────────────

    if (data === 'adm_maintenance') {
        const current = db.getSetting('maintenance_mode') === '1';
        db.setSetting('maintenance_mode', current ? '0' : '1');
        await ctx.answerCallbackQuery(`Maintenance ${!current ? 'Diaktifkan' : 'Dinonaktifkan'}`);
        return sendAdminPanel(ctx, true);
    }

    // ─── PAYMENT TOGGLE ──────────────────────────────────────────────────────

    if (data === 'adm_payment_toggle') {
        const current = db.getSetting('payment_enabled') !== '0'; // default true
        db.setSetting('payment_enabled', current ? '0' : '1');
        await ctx.answerCallbackQuery(`Fitur Premium ${!current ? 'Diaktifkan' : 'Dinonaktifkan'}`);
        return sendAdminPanel(ctx, true);
    }

    // ─── BACK ───────────────────────────────────────────────────────────────

    if (data === 'adm_back') {
        ctx.session.adminAction = null;
        return sendAdminPanel(ctx, true);
    }

    // ─── UNBAN FROM LOG ─────────────────────────────────────────────────────

    if (data.startsWith('admin_unban:')) {
        const targetId = parseInt(data.split(':')[1], 10);
        db.unbanUser(targetId);
        try { await ctx.api.sendMessage(targetId, '✅ Akun kamu telah di-unban. Ketik /start.'); } catch { }
        return ctx.reply(`✅ User <code>${targetId}</code> di-unban.`, { parse_mode: 'HTML' });
    }

    if (data.startsWith('admin_reports:')) {
        const targetId = parseInt(data.split(':')[1], 10);
        const reports = db.getReportsByUser(targetId);
        const text = reports.length
            ? `📋 <b>Laporan - User ${targetId}</b>\n\n` +
            reports.slice(0, 10).map((r, i) =>
                `${i + 1}. ${r.category} — ${formatDate(r.created_at)} (by <code>${r.reporter_id}</code>)`
            ).join('\n')
            : `Tidak ada laporan untuk <code>${targetId}</code>.`;
        return ctx.reply(text, { parse_mode: 'HTML' });
    }
}

// ─── Handle text input from admin (broadcast, ban, fsub_add) ─────────────────

async function handleAdminInput(ctx) {
    if (!isAdmin(ctx.from.id)) return false;
    const action = ctx.session.adminAction;
    if (!action) return false;

    ctx.session.adminAction = null;

    if (action === 'fsub_add') {
        const chatId = parseInt(ctx.message.text?.trim(), 10);
        if (isNaN(chatId)) {
            await ctx.reply('❌ Chat ID tidak valid.');
            return true;
        }
        try {
            const chat = await ctx.api.getChat(chatId);
            const title = chat.title || chat.username || String(chatId);
            const link = chat.invite_link || (chat.username ? `https://t.me/${chat.username}` : '');
            db.addFsub(chatId, title, link);
            await ctx.reply(`✅ <b>${escapeHtml(title)}</b> (<code>${chatId}</code>) ditambahkan.`, { parse_mode: 'HTML' });
        } catch (err) {
            await ctx.reply(`❌ Gagal: ${err.message}\n\nPastikan bot sudah admin di channel.`);
        }
        return true;
    }

    if (action === 'fsub_text') {
        if (!ctx.message.text) return true;
        db.setSetting('fsub_text', ctx.message.text);
        await ctx.reply('✅ <b>Teks FSUB berhasil diubah!</b>', { parse_mode: 'HTML' });
        return true;
    }

    if (action === 'broadcast') {
        const allUsers = db.getAllUserIds();
        await ctx.reply(`📣 Mengirim ke ${allUsers.length} pengguna...`);
        let sent = 0, failed = 0;

        for (const targetId of allUsers) {
            try {
                const msg = ctx.message;
                if (msg.text) {
                    await ctx.api.sendMessage(targetId, msg.text, { parse_mode: 'HTML' });
                } else if (msg.photo) {
                    await ctx.api.sendPhoto(targetId, msg.photo[msg.photo.length - 1].file_id, { caption: msg.caption });
                } else if (msg.video) {
                    await ctx.api.sendVideo(targetId, msg.video.file_id, { caption: msg.caption });
                } else {
                    await ctx.api.forwardMessage(targetId, msg.chat.id, msg.message_id);
                }
                sent++;
                await new Promise((r) => setTimeout(r, 50));
            } catch { failed++; }
        }
        await ctx.reply(`📣 Selesai!\n✅ Terkirim: ${sent}\n❌ Gagal: ${failed}`);
        return true;
    }

    if (action === 'ban_input') {
        const targetId = parseInt(ctx.message.text?.trim(), 10);
        if (isNaN(targetId)) {
            await ctx.reply('❌ User ID tidak valid.');
            return true;
        }
        const user = db.getUser(targetId);
        if (!user) {
            await ctx.reply(`❌ User <code>${targetId}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
            return true;
        }
        if (user.is_banned) {
            db.unbanUser(targetId);
            await ctx.reply(`✅ User <code>${targetId}</code> di-unban.`, { parse_mode: 'HTML' });
            try { await ctx.api.sendMessage(targetId, '✅ Akun kamu telah di-unban. Ketik /start.'); } catch { }
        } else {
            db.banUser(targetId, 'Dibanned oleh admin');
            await ctx.reply(`🔨 User <code>${targetId}</code> dibanned.`, { parse_mode: 'HTML' });
            try {
                await ctx.api.sendMessage(
                    targetId,
                    `🚫 Akun kamu diblokir.\n\nAlasan: Dibanned oleh admin\n\nSupport: ${config.PAYSUPPORT_LINK}`
                );
            } catch { }
        }
        return true;
    }

    if (action === 'restore_db') {
        if (!ctx.message.document || !ctx.message.document.file_name.endsWith('.zip')) {
            await ctx.reply('❌ Harap kirimkan file dengan ekstensi <b>.zip</b>', { parse_mode: 'HTML' });
            return true;
        }

        const msg = await ctx.reply('⏳ <i>Mendownload dan restore database... (Downtime ~3 detik)</i>', { parse_mode: 'HTML' });

        try {
            const fileId = ctx.message.document.file_id;
            const file = await ctx.api.getFile(fileId);
            const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Gagal mendownload file dari Telegram API');

            const buffer = Buffer.from(await response.arrayBuffer());

            // Execute restore
            db.restoreDatabase(buffer);

            await ctx.api.editMessageText(
                ctx.chat.id,
                msg.message_id,
                '✅ <b>Restore Berhasil!</b>\n\nBot akan direstart secara otomatis dalam 2 detik...',
                { parse_mode: 'HTML' }
            );

            setTimeout(() => process.exit(1), 2000); // Trigger auto-restart
        } catch (err) {
            console.error('[Restore Error]', err);
            await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `❌ <b>Restore Gagal</b>\n\n${err.message}`, { parse_mode: 'HTML' });
        }
        return true;
    }

    return false;
}

module.exports = { handleAdmin, handleAdminCallback, handleAdminInput, isAdmin };
