const db = require('../db/database');
const config = require('../config');

/**
 * Relay a message from a user to their active partner.
 * Handles all Telegram message types.
 * @param {import('grammy').Context} ctx - grammY context of the SENDER
 */
async function relayMessage(ctx) {
    const fromId = ctx.from.id;
    const partnerId = db.getPartner(fromId);
    if (!partnerId) return false;

    const msg = ctx.message;

    try {
        if (msg.text) {
            await ctx.api.sendMessage(partnerId, msg.text);
        } else if (msg.sticker) {
            await ctx.api.sendSticker(partnerId, msg.sticker.file_id);
        } else if (msg.photo) {
            const photo = msg.photo[msg.photo.length - 1];
            await ctx.api.sendPhoto(partnerId, photo.file_id, { caption: msg.caption });
            await maybeForwardMedia(ctx, partnerId);
        } else if (msg.video) {
            await ctx.api.sendVideo(partnerId, msg.video.file_id, { caption: msg.caption });
            await maybeForwardMedia(ctx, partnerId);
        } else if (msg.voice) {
            await ctx.api.sendVoice(partnerId, msg.voice.file_id);
            await maybeForwardMedia(ctx, partnerId);
        } else if (msg.audio) {
            await ctx.api.sendAudio(partnerId, msg.audio.file_id, { caption: msg.caption });
            await maybeForwardMedia(ctx, partnerId);
        } else if (msg.document) {
            await ctx.api.sendDocument(partnerId, msg.document.file_id, { caption: msg.caption });
            await maybeForwardMedia(ctx, partnerId);
        } else if (msg.animation) {
            await ctx.api.sendAnimation(partnerId, msg.animation.file_id, { caption: msg.caption });
        } else if (msg.video_note) {
            await ctx.api.sendVideoNote(partnerId, msg.video_note.file_id);
            await maybeForwardMedia(ctx, partnerId);
        } else if (msg.location) {
            await ctx.api.sendLocation(partnerId, msg.location.latitude, msg.location.longitude);
        } else {
            // Fallback: forward raw message
            await ctx.api.forwardMessage(partnerId, msg.chat.id, msg.message_id);
        }
        return true;
    } catch (err) {
        console.error(`[Relay] ${fromId} → ${partnerId}: ${err.message}`);
        return false;
    }
}

/**
 * Forward media to log group if setting is enabled.
 */
async function maybeForwardMedia(ctx, partnerId) {
    if (!config.LOG_GROUP_ID) return;
    if (db.getSetting('media_log_enabled') !== '1') return;

    const fromId = ctx.from.id;
    const msg = ctx.message;
    try {
        await ctx.api.forwardMessage(config.LOG_GROUP_ID, msg.chat.id, msg.message_id);
        await ctx.api.sendMessage(
            config.LOG_GROUP_ID,
            `📤 Media log\nFrom: <code>${fromId}</code> → To: <code>${partnerId}</code>`,
            { parse_mode: 'HTML' }
        );
    } catch (err) {
        console.error('[Relay] Media log error:', err.message);
    }
}

module.exports = { relayMessage };
