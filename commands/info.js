const db = require('../db/database');
const { t } = require('../src/utils');
const config = require('../config');

async function handleHelp(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.reply(
        t('help', lang, { bot_username: config.BOT_USERNAME }),
        { parse_mode: 'HTML' }
    );
}

async function handleRules(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.reply(t('rules', lang), { parse_mode: 'HTML' });
}

async function handleTerms(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.reply(t('terms', lang), { parse_mode: 'HTML' });
}

module.exports = { handleHelp, handleRules, handleTerms };
