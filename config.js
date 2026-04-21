require('dotenv').config();

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  BOT_USERNAME: process.env.BOT_USERNAME || '',
  ADMIN_IDS: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  LOG_GROUP_ID: parseInt(process.env.LOG_GROUP_ID, 10) || null,
  PAYSUPPORT_LINK: process.env.PAYSUPPORT_LINK || 'https://t.me/yoursupport',
  PREMIUM_1W_STARS: parseInt(process.env.PREMIUM_1W_STARS, 10) || 50,
  PREMIUM_1M_STARS: parseInt(process.env.PREMIUM_1M_STARS, 10) || 150,
  PREMIUM_3M_STARS: parseInt(process.env.PREMIUM_3M_STARS, 10) || 300,
  VIP_STARS: parseInt(process.env.VIP_STARS, 10) || 1000,
  VIP_DAYS: parseInt(process.env.VIP_DAYS, 10) || 365,
  VIP_DAYS: parseInt(process.env.VIP_DAYS, 10) || 365,
};

if (!config.BOT_TOKEN) {
  console.error('[ERROR] BOT_TOKEN is not set in .env file');
  process.exit(1);
}

module.exports = config;
