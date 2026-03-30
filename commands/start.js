const db = require('../db/database');
const { t } = require('../src/utils');
const { startSearch } = require('../src/matching');
const { checkFsub } = require('../src/middleware');

/**
 * /start and /search handler.
 * Uses grammY ctx.
 * @param {import('grammy').Context} ctx
 */
async function handleStart(ctx) {
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';

    // FSUB check (requires bot instance)
    if (!await checkFsub(ctx.api, userId, lang)) return;

    await startSearch(ctx.api, userId, lang);
}

// Export a factory that returns the grammY handler function
// so we can pass bot instance where needed
module.exports = {
    handleStart,
    handleSearch: handleStart,
};
