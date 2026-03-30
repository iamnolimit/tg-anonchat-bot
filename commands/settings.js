const db = require('../db/database');
const { t, buildKeyboard } = require('../src/utils');

/**
 * /settings command — shows the inline settings menu.
 * State for age input is stored in grammY session: ctx.session.awaitingAge
 */
async function handleSettings(ctx) {
    await sendSettingsMenu(ctx, false);
}

async function sendSettingsMenu(ctx, isEdit = false) {
    const userId = ctx.from.id;
    const user = db.getUser(userId);
    const lang = user?.language || 'id';
    const plan = db.getSubscriptionPlan(userId);

    const genderLabel = {
        any: lang === 'id' ? 'Semua' : 'Any',
        male: lang === 'id' ? 'Pria' : 'Male',
        female: lang === 'id' ? 'Wanita' : 'Female',
    }[user?.gender || 'any'];

    const ageLabel = user?.age ? String(user.age) : (lang === 'id' ? 'Belum diset' : 'Not set');
    const langLabel = lang === 'id' ? '🇮🇩 Indonesia' : '🇬🇧 English';

    const genderRow =
        plan !== 'free'
            ? [{ text: t('settings_gender', lang, { value: genderLabel }), callback_data: 'set_gender' }]
            : [{ text: `🔒 ${lang === 'id' ? 'Filter Gender (Premium)' : 'Gender Filter (Premium)'}`, callback_data: 'set_gender_locked' }];

    const kb = buildKeyboard([
        genderRow,
        [{ text: t('settings_age', lang, { value: ageLabel }), callback_data: 'set_age' }],
        [{ text: t('settings_lang', lang, { value: langLabel }), callback_data: 'set_lang' }],
        [{ text: lang === 'id' ? '✅ Selesai' : '✅ Done', callback_data: 'settings_done' }],
    ]);
    const text = t('settings_title', lang);
    const opts = { parse_mode: 'HTML', reply_markup: kb };

    if (isEdit) {
        await ctx.editMessageText(text, opts);
    } else {
        await ctx.reply(text, opts);
    }
}

// ─── Callback handlers (registered individually in bot.js) ───────────────────

async function handleGenderLocked(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.answerCallbackQuery();
    await ctx.reply(t('settings_gender_locked', lang), { parse_mode: 'HTML' });
}

async function handleGenderMenu(ctx) {
    const userId = ctx.from.id;
    const lang = db.getUser(userId)?.language || 'id';
    const plan = db.getSubscriptionPlan(userId);
    await ctx.answerCallbackQuery();
    if (plan === 'free') {
        await ctx.editMessageText(t('settings_gender_locked', lang), { parse_mode: 'HTML', reply_markup: buildKeyboard([[{ text: '⬅️ Kembali', callback_data: 'settings_back' }]]) });
        return;
    }
    const kb = buildKeyboard([[
        { text: lang === 'id' ? '👥 Semua' : '👥 Any', callback_data: 'gender_any' },
        { text: lang === 'id' ? '👨 Pria' : '👨 Male', callback_data: 'gender_male' },
        { text: lang === 'id' ? '👩 Wanita' : '👩 Female', callback_data: 'gender_female' },
    ]]);
    await ctx.editMessageText(
        lang === 'id' ? '🚻 Pilih gender pasangan yang dicari:' : '🚻 Select partner gender:',
        { reply_markup: kb }
    );
}

async function handleGenderSet(ctx) {
    const gender = ctx.callbackQuery.data.replace('gender_', '');
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    db.updateUserSettings(ctx.from.id, { gender });
    await ctx.answerCallbackQuery(t('settings_saved', lang));
    await sendSettingsMenu(ctx, true);
}

async function handleAgeMenu(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.answerCallbackQuery();
    // Mark in session that we're awaiting age
    ctx.session.awaitingAge = true;
    const kb = buildKeyboard([[{ text: '⬅️ Kembali', callback_data: 'settings_back' }]]);
    await ctx.editMessageText(t('settings_age_prompt', lang), { reply_markup: kb });
}

async function handleLangMenu(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.answerCallbackQuery();
    const kb = buildKeyboard([[
        { text: '🇮🇩 Indonesia', callback_data: 'lang_id' },
        { text: '🇬🇧 English', callback_data: 'lang_en' },
    ]]);
    await ctx.editMessageText(lang === 'id' ? '🌐 Pilih bahasa:' : '🌐 Select language:', { reply_markup: kb });
}

async function handleLangSet(ctx) {
    const newLang = ctx.callbackQuery.data.replace('lang_', '');
    db.updateUserSettings(ctx.from.id, { language: newLang });
    await ctx.answerCallbackQuery(t('settings_saved', newLang));
    await sendSettingsMenu(ctx, true);
}

async function handleSettingsDone(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    await ctx.answerCallbackQuery();
    try { await ctx.deleteMessage(); } catch { }
}

async function handleSettingsBack(ctx) {
    ctx.session.awaitingAge = false;
    await ctx.answerCallbackQuery();
    await sendSettingsMenu(ctx, true);
}

/**
 * Handle age text input — called from the message handler when session.awaitingAge is true.
 */
async function handleAgeInput(ctx) {
    const lang = db.getUser(ctx.from.id)?.language || 'id';
    const age = parseInt(ctx.message.text, 10);

    ctx.session.awaitingAge = false;

    if (isNaN(age) || age < 13 || age > 99) {
        await ctx.reply(t('settings_age_invalid', lang));
        return;
    }
    db.updateUserSettings(ctx.from.id, { age });
    await ctx.reply(t('settings_saved', lang));
}

module.exports = {
    handleSettings,
    handleGenderLocked,
    handleGenderMenu,
    handleGenderSet,
    handleAgeMenu,
    handleLangMenu,
    handleLangSet,
    handleSettingsDone,
    handleSettingsBack,
    handleAgeInput,
};
