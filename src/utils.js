const { InlineKeyboard, Keyboard } = require('grammy');
const config = require('../config');

const locales = {
    id: require('../locales/id.json'),
    en: require('../locales/en.json'),
};

/**
 * Get a localized string.
 * @param {string} key
 * @param {string} lang - 'id' | 'en'
 * @param {object} vars - Template variables
 */
function t(key, lang = 'id', vars = {}) {
    const locale = locales[lang] || locales['id'];
    let str = locale[key] || locales['id'][key] || key;
    for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v ?? '');
    }
    return str;
}

/**
 * Build a grammY InlineKeyboard from a 2D array of buttons.
 * Each button: { text, callback_data?, url? }
 */
function buildKeyboard(buttons) {
    const kb = new InlineKeyboard();
    for (const row of buttons) {
        for (const btn of row) {
            if (btn.url) {
                kb.url(btn.text, btn.url);
            } else {
                kb.text(btn.text, btn.callback_data || btn.text);
            }
        }
        kb.row();
    }
    return kb;
}

/**
 * Format a date string to readable WIB string.
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

/**
 * Add days to current date and return ISO string.
 */
function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
}

/**
 * Escape HTML for Telegram HTML parse mode.
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Get a user's display name from a Telegram user object.
 */
function getUserName(telegramUser) {
    if (!telegramUser) return 'Unknown';
    return telegramUser.first_name || telegramUser.username || String(telegramUser.id);
}

/**
 * Persistent ReplyKeyboard when user is idle
 */
function getIdleKeyboard(lang = 'id') {
    return new Keyboard()
        .text(lang === 'id' ? '🔍 Cari Pasangan' : '🔍 Find Partner').row()
        .text(lang === 'id' ? '🚻 Cari Berdasarkan Gender' : '🚻 Search by Gender')
        .resized()
        .persistent();
}

/**
 * Persistent ReplyKeyboard when user is in active chat
 */
function getChatKeyboard(lang = 'id') {
    return new Keyboard()
        .text('🛑 Stop').row()
        .text('⏭ Next').row()
        .text('👤 Share Profile')
        .resized()
        .persistent();
}

module.exports = { t, buildKeyboard, formatDate, addDays, escapeHtml, getUserName, getIdleKeyboard, getChatKeyboard };
